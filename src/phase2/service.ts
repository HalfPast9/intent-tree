import { randomUUID } from "node:crypto";

import {
  createAbstractionStack,
  createArchEdge,
  createArchNode,
  createEvent,
  createLayerCriteriaDoc,
  createNodeChecklistDraft,
  createSession,
  getAbstractionStackById,
  getArchNodeById,
  getEdgesByDepth,
  getEventsByNodeId,
  getLayerCriteriaDocByDepth,
  getNodeNeighbours,
  getNodeParents,
  getNodeSiblings,
  getNodesByDepth,
  getNodeChecklistDraftsByDepth,
  getProblemSpecById,
  getSessionById,
  getAnySession,
  updateAbstractionStack,
  updateArchNode,
  updateLayerCriteriaDoc,
  updateNodeChecklistDraft,
  updateSession
} from "../db/index.js";
import { getEventsByType } from "../db/repositories/index.js";
import { callLLMWithMessages } from "../llm/client.js";
import { EventActor } from "../models/event.js";
import { ArchNode } from "../models/archNode.js";
import { AbstractionStack } from "../models/abstractionStack.js";
import { LayerCriteriaDoc } from "../models/layerCriteriaDoc.js";
import { ProblemSpec } from "../models/problemSpec.js";
import { SessionRecord } from "../models/session.js";
import {
  buildSimpleMessages,
  prompt3System,
  prompt3User,
  prompt4System,
  prompt4User,
  prompt5System,
  prompt5User,
  prompt6System,
  prompt6User,
  prompt7System,
  prompt7User,
  promptLeafSystem,
  promptLeafUser,
  LeafDeterminationResponse,
  PromptRewriteResponse,
  Prompt3Response,
  Prompt4Response,
  Prompt5Response,
  Prompt6Response,
  Prompt7Response,
  Prompt10Response,
  prompt10System,
  prompt10User,
  promptRewriteSystem,
  promptRewriteUser,
  StackLayerInput
} from "./prompts.js";
import { runSyntaxCheck, SyntaxCheckResult } from "./syntaxChecker.js";

const SESSION_ID = "default-session";
const PHASE1_SPEC_ID = "spec-url-shortener";

const pendingDefinitionByDepth = new Map<number, Prompt3Response>();
const pendingNodesByDepth = new Map<number, Prompt4Response["nodes"]>();
const pendingReproposeByDepth = new Map<number, Prompt4Response["nodes"]>();
const pendingLeafByDepth = new Map<number, LeafDeterminationResponse>();

export interface Phase2NodeView {
  id: string;
  intent: string;
  parents: string[];
  inputs: string;
  outputs: string;
  edges: Array<{ target: string; interface: string; direction: "directed" | "bidirectional" }>;
  checklist: string[];
  state: string;
  leaf: boolean | null | undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function emitEvent(
  type: string,
  actor: EventActor,
  payload: Record<string, unknown>,
  nodeIds: string[] = [PHASE1_SPEC_ID]
): Promise<void> {
  await createEvent({
    id: randomUUID(),
    type,
    timestamp: nowIso(),
    actor,
    node_ids: nodeIds,
    payload: JSON.stringify(payload)
  });
}

function parseStackLayers(stack: AbstractionStack | null): StackLayerInput[] {
  if (!stack) {
    return [];
  }

  try {
    const parsed = JSON.parse(stack.layers) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          return null;
        }

        const layer = typeof entry.layer === "string" ? entry.layer : "";
        const description = typeof entry.description === "string" ? entry.description : "";
        const reasoning = typeof entry.reasoning === "string" ? entry.reasoning : "";

        if (!layer || !description || !reasoning) {
          return null;
        }

        return { layer, description, reasoning };
      })
      .filter((entry): entry is StackLayerInput => entry !== null);
  } catch {
    return [];
  }
}

function parseChecklist(value: string): Array<{ item: string; context: string }> {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          return null;
        }

        const item = typeof entry.item === "string" ? entry.item : "";
        const context = typeof entry.context === "string" ? entry.context : "";

        if (!item) {
          return null;
        }

        return { item, context };
      })
      .filter((entry): entry is { item: string; context: string } => entry !== null);
  } catch {
    return [];
  }
}

async function requirePhase1Spec(): Promise<ProblemSpec> {
  const spec = await getProblemSpecById(PHASE1_SPEC_ID);

  if (!spec) {
    throw new Error("Phase 1 spec does not exist.");
  }

  if (!spec.locked) {
    throw new Error("Phase 1 must be locked before Phase 2 starts.");
  }

  return spec;
}

function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  return String(value ?? "");
}

function validatePrompt3(raw: Record<string, unknown>): Prompt3Response {
  const checklistRaw = Array.isArray(raw.checklist_template) ? raw.checklist_template : [];
  const checklist = checklistRaw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  const doc: Prompt3Response = {
    layer_name: typeof raw.layer_name === "string" ? raw.layer_name : "",
    responsibility_scope: typeof raw.responsibility_scope === "string" ? raw.responsibility_scope : "",
    considerations: coerceToString(raw.considerations),
    out_of_scope: coerceToString(raw.out_of_scope),
    checklist_template: checklist
  };

  if (!doc.layer_name || !doc.responsibility_scope || !doc.considerations || !doc.out_of_scope) {
    throw new Error("Prompt 3 returned invalid layer definition fields.");
  }

  return doc;
}

function validatePrompt4(raw: Record<string, unknown>): Prompt4Response {
  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes : [];

  const nodes = nodesRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }

      const nodeEntry = entry as Record<string, unknown>;

      const id = typeof nodeEntry.id === "string" ? nodeEntry.id : "";
      const intent = typeof nodeEntry.intent === "string" ? nodeEntry.intent : "";
      const parents = Array.isArray(nodeEntry.parents)
        ? nodeEntry.parents.filter((p: unknown): p is string => typeof p === "string")
        : [];
      const inputs = typeof nodeEntry.inputs === "string" ? nodeEntry.inputs : "";
      const outputs = typeof nodeEntry.outputs === "string" ? nodeEntry.outputs : "";
      const claimed_from = typeof nodeEntry.claimed_from === "string" ? nodeEntry.claimed_from : null;

      let proposed_edits: { intent?: string; inputs?: string; outputs?: string } | null = null;
      if (
        typeof nodeEntry.proposed_edits === "object" &&
        nodeEntry.proposed_edits !== null &&
        !Array.isArray(nodeEntry.proposed_edits)
      ) {
        const pe = nodeEntry.proposed_edits as Record<string, unknown>;
        proposed_edits = {};
        if (typeof pe.intent === "string") proposed_edits.intent = pe.intent;
        if (typeof pe.inputs === "string") proposed_edits.inputs = pe.inputs;
        if (typeof pe.outputs === "string") proposed_edits.outputs = pe.outputs;
        if (!Object.keys(proposed_edits).length) proposed_edits = null;
      }

      const edges = Array.isArray(nodeEntry.edges)
        ? nodeEntry.edges
            .map((edge: unknown) => {
              if (typeof edge !== "object" || edge === null || Array.isArray(edge)) {
                return null;
              }

              const edgeEntry = edge as Record<string, unknown>;

              const target = typeof edgeEntry.target === "string" ? edgeEntry.target : "";
              const iface = typeof edgeEntry.interface === "string" ? edgeEntry.interface : "";
              const direction: "directed" | "bidirectional" =
                edgeEntry.direction === "bidirectional" ? "bidirectional" : "directed";

              if (!target || !iface) {
                return null;
              }

              return { target, interface: iface, direction };
            })
            .filter((edge): edge is { target: string; interface: string; direction: "directed" | "bidirectional" } => edge !== null)
        : [];

      const checklist = Array.isArray(nodeEntry.checklist)
        ? nodeEntry.checklist
            .map((item: unknown) => {
              if (typeof item !== "object" || item === null || Array.isArray(item)) {
                return null;
              }

              const checklistEntry = item as Record<string, unknown>;

              const text = typeof checklistEntry.item === "string" ? checklistEntry.item : "";
              const context = typeof checklistEntry.context === "string" ? checklistEntry.context : "";

              if (!text) {
                return null;
              }

              return { item: text, context };
            })
            .filter((item: { item: string; context: string } | null): item is { item: string; context: string } => item !== null)
        : [];

      if (!id || !intent) {
        return null;
      }

      return { id, intent, parents, inputs, outputs, edges, claimed_from, proposed_edits, checklist };
    })
    .filter((node): node is Prompt4Response["nodes"][number] => node !== null);

  if (!nodes.length) {
    throw new Error("Prompt 4 returned no valid nodes.");
  }

  return { nodes };
}

function validatePrompt5(raw: Record<string, unknown>): Prompt5Response {
  const passed = typeof raw.passed === "boolean" ? raw.passed : false;
  const resultsRaw = Array.isArray(raw.results) ? raw.results : [];

  const results = resultsRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }

      const e = entry as Record<string, unknown>;
      const item = typeof e.item === "string" ? e.item : "";
      const itemPassed = typeof e.passed === "boolean" ? e.passed : false;
      const reasoning = typeof e.reasoning === "string" ? e.reasoning : "";

      if (!item || !reasoning) {
        return null;
      }

      return { item, passed: itemPassed, reasoning };
    })
    .filter((r): r is Prompt5Response["results"][number] => r !== null);

  return { passed, results };
}

function validatePrompt6(raw: Record<string, unknown>): Prompt6Response {
  const passed = typeof raw.passed === "boolean" ? raw.passed : false;
  const coverageRaw = Array.isArray(raw.coverage) ? raw.coverage : [];
  const overlapsRaw = Array.isArray(raw.overlaps) ? raw.overlaps : [];

  const coverage = coverageRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }

      const e = entry as Record<string, unknown>;
      const parent = typeof e.parent === "string" ? e.parent : "";
      const fully_covered = typeof e.fully_covered === "boolean" ? e.fully_covered : false;
      const gaps = Array.isArray(e.gaps) ? e.gaps.filter((g): g is string => typeof g === "string") : [];
      const reasoning = typeof e.reasoning === "string" ? e.reasoning : "";

      if (!parent || !reasoning) {
        return null;
      }

      return { parent, fully_covered, gaps, reasoning };
    })
    .filter((c): c is Prompt6Response["coverage"][number] => c !== null);

  const overlaps = overlapsRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }

      const e = entry as Record<string, unknown>;
      const nodes = Array.isArray(e.nodes) ? e.nodes.filter((n): n is string => typeof n === "string") : [];
      const overlap = typeof e.overlap === "string" ? e.overlap : "";
      const reasoning = typeof e.reasoning === "string" ? e.reasoning : "";

      if (!overlap || !reasoning) {
        return null;
      }

      return { nodes, overlap, reasoning };
    })
    .filter((o): o is Prompt6Response["overlaps"][number] => o !== null);

  return { passed, coverage, overlaps };
}

function validatePrompt7(raw: Record<string, unknown>): Prompt7Response {
  const classification = raw.classification === "design" ? "design" : "implementation";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
  const origin_nodes = Array.isArray(raw.origin_nodes)
    ? raw.origin_nodes.filter((id): id is string => typeof id === "string")
    : [];
  const suggested_action = typeof raw.suggested_action === "string" ? raw.suggested_action : "";

  return {
    classification,
    reasoning,
    origin_nodes,
    suggested_action
  };
}

function validatePrompt10(raw: Record<string, unknown>): Prompt10Response {
  const passed = typeof raw.passed === "boolean" ? raw.passed : false;

  const edgeResultsRaw = Array.isArray(raw.edge_results) ? raw.edge_results : [];
  const edge_results = edgeResultsRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
      const e = entry as Record<string, unknown>;
      const source = typeof e.source === "string" ? e.source : "";
      const target = typeof e.target === "string" ? e.target : "";
      const edgePassed = typeof e.passed === "boolean" ? e.passed : false;
      const issues = Array.isArray(e.issues)
        ? (e.issues as Array<Record<string, unknown>>)
            .map((issue) => {
              const type = typeof issue.type === "string" ? issue.type : "";
              const description = typeof issue.description === "string" ? issue.description : "";
              if (!type || !description) return null;
              return { type: type as "interface_incompatible" | "direction_incorrect" | "interface_vague", description };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null)
        : [];
      if (!source || !target) return null;
      return { source, target, passed: edgePassed, issues };
    })
    .filter((r): r is Prompt10Response["edge_results"][number] => r !== null);

  const missingRaw = Array.isArray(raw.missing_edges) ? raw.missing_edges : [];
  const missing_edges = missingRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
      const e = entry as Record<string, unknown>;
      const source = typeof e.source === "string" ? e.source : "";
      const target = typeof e.target === "string" ? e.target : "";
      const rationale = typeof e.rationale === "string" ? e.rationale : "";
      const suggested_interface = typeof e.suggested_interface === "string" ? e.suggested_interface : "";
      const suggested_direction: "directed" | "bidirectional" = e.suggested_direction === "bidirectional" ? "bidirectional" : "directed";
      if (!source || !target) return null;
      return { source, target, rationale, suggested_interface, suggested_direction };
    })
    .filter((r): r is Prompt10Response["missing_edges"][number] => r !== null);

  return { passed, edge_results, missing_edges };
}

function validateLeafDeterminationResponse(raw: Record<string, unknown>): LeafDeterminationResponse {
  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes : [];

  const nodes = nodesRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }

      const node = entry as Record<string, unknown>;
      const node_id = typeof node.node_id === "string" ? node.node_id : "";
      const determination =
        node.determination === "leaf" || node.determination === "decompose_further"
          ? node.determination
          : "decompose_further";
      const reasoning = typeof node.reasoning === "string" ? node.reasoning : "";

      if (!node_id) {
        return null;
      }

      return { node_id, determination, reasoning };
    })
    .filter((entry): entry is LeafDeterminationResponse["nodes"][number] => entry !== null);

  return { nodes };
}

function validatePromptRewrite(raw: Record<string, unknown>): PromptRewriteResponse {
  if (typeof raw.intent !== "string" || !raw.intent.trim())
    throw new Error("Invalid rewrite response: intent must be a non-empty string.");
  if (typeof raw.inputs !== "string" || !raw.inputs.trim())
    throw new Error("Invalid rewrite response: inputs must be a non-empty string.");
  if (typeof raw.outputs !== "string" || !raw.outputs.trim())
    throw new Error("Invalid rewrite response: outputs must be a non-empty string.");
  return {
    intent: raw.intent.trim(),
    inputs: raw.inputs.trim(),
    outputs: raw.outputs.trim()
  };
}

async function runClaimValidation(
  spec: ProblemSpec,
  node: { id: string; intent: string; inputs: string; outputs: string },
  parentNodeIds: string[],
  depth: number
): Promise<boolean> {
  const parentNodes = await Promise.all(parentNodeIds.map((id) => getArchNodeById(id)));
  const validParents = parentNodes
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({ id: p.id, intent: p.intent, inputs: p.inputs, outputs: p.outputs }));

  if (!validParents.length) return true;

  const drafts = await getNodeChecklistDraftsByDepth(depth);
  const draft = drafts.find((d) => d.node_id === node.id);
  if (!draft) return true;

  const checklist = parseChecklist(draft.checklist);
  if (!checklist.length) return true;

  const siblings = await getNodeSiblings(node.id);
  const neighbours = await getNodeNeighbours(node.id);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt5System(),
      prompt5User({
        spec,
        node: {
          ...node,
          edges: []
        },
        parentNodes: validParents,
        siblings: siblings.map((s) => ({ id: s.id, intent: s.intent, inputs: s.inputs, outputs: s.outputs })),
        neighbours: neighbours.map((n) => ({ id: n.id, intent: n.intent, inputs: n.inputs, outputs: n.outputs })),
        checklist
      })
    )
  );

  return validatePrompt5(raw).passed;
}

export async function ensureDefaultSession(): Promise<SessionRecord> {
  const existing = await getSessionById(SESSION_ID);

  if (existing) {
    return existing;
  }

  const any = await getAnySession();

  if (any) {
    return any;
  }

  return createSession({
    id: SESSION_ID,
    current_phase: "phase1",
    current_depth: null,
    problem_spec_id: PHASE1_SPEC_ID,
    stack_id: null
  });
}

async function getCurrentSession(): Promise<SessionRecord> {
  const session = await ensureDefaultSession();
  return session;
}

async function getSessionStackLayers(session: SessionRecord): Promise<StackLayerInput[]> {
  if (!session.stack_id) {
    return [];
  }

  const stack = await getAbstractionStackById(session.stack_id);
  return parseStackLayers(stack);
}

async function appendLayerToStack(
  session: SessionRecord,
  layerDef: {
    layer_name: string;
    responsibility_scope: string;
    considerations: string;
    out_of_scope: string;
    checklist_template: string[];
  }
): Promise<void> {
  const entry: StackLayerInput = {
    layer: layerDef.layer_name,
    description: layerDef.responsibility_scope,
    reasoning: layerDef.considerations
  };

  if (session.stack_id) {
    const stack = await getAbstractionStackById(session.stack_id);

    if (stack) {
      const existing = parseStackLayers(stack);
      existing.push(entry);
      await updateAbstractionStack(stack.id, { layers: JSON.stringify(existing) });
      return;
    }
  }

  const newStack = await createAbstractionStack({
    id: `stack-${randomUUID()}`,
    layers: JSON.stringify([entry])
  });

  await updateSession(session.id, { stack_id: newStack.id });
}

export async function transitionSessionToPhase2(): Promise<SessionRecord> {
  await requirePhase1Spec();
  const session = await getCurrentSession();

  const updated = await updateSession(session.id, {
    current_phase: "phase2",
    current_depth: 0
  });

  if (!updated) {
    throw new Error("Failed to update session for phase2 transition.");
  }

  return updated;
}


function getCurrentLayerMeta(stackLayers: StackLayerInput[], depth: number): {
  layerName: string;
  layerDescription: string;
  totalLayers: number;
} {
  const totalLayers = Math.max(stackLayers.length, depth + 1, 1);
  const current = stackLayers[depth] ?? {
    layer: `Depth ${depth}`,
    description: "Layer definition unavailable"
  };

  return {
    layerName: current.layer,
    layerDescription: current.description,
    totalLayers
  };
}

async function getParentIntents(spec: ProblemSpec, depth: number): Promise<string[]> {
  if (depth === 0) {
    return [spec.problem_statement];
  }

  const parentNodes = await getNodesByDepth(depth - 1);
  return parentNodes.map((node) => node.intent).filter((intent) => Boolean(intent.trim()));
}

async function getParentLayerCriteriaDocContext(depth: number): Promise<Record<string, unknown> | null> {
  if (depth === 0) {
    return null;
  }

  const parentDoc = await getLayerCriteriaDocByDepth(depth - 1);

  if (!parentDoc || !parentDoc.locked) {
    return null;
  }

  return {
    id: parentDoc.id,
    depth: parentDoc.depth,
    layer_name: parentDoc.layer_name,
    responsibility_scope: parentDoc.responsibility_scope,
    considerations: parentDoc.considerations,
    out_of_scope: parentDoc.out_of_scope,
    checklist_template: JSON.parse(parentDoc.checklist_template)
  };
}

export async function generateLayerDefinition(depth: number): Promise<LayerCriteriaDoc> {
  await requirePhase1Spec();

  await emitEvent("layer_started", "llm", { depth });

  const spec = await requirePhase1Spec();
  const session = await getCurrentSession();
  const layers = await getSessionStackLayers(session);
  const parentIntents = await getParentIntents(spec, depth);
  const parentLayerCriteriaDoc = await getParentLayerCriteriaDocContext(depth);
  const layerMeta = getCurrentLayerMeta(layers, depth);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt3System({
        layerName: layerMeta.layerName,
        depth,
        totalLayers: layerMeta.totalLayers,
        layerDescription: layerMeta.layerDescription
      }),
      prompt3User({
        spec,
        stack: layers,
        depth,
        parentIntents,
        parentLayerCriteriaDoc,
        existingNodesAtDepth: []
      })
    )
  );

  const parsed = validatePrompt3(raw);
  pendingDefinitionByDepth.set(depth, parsed);

  const existingDoc = await getLayerCriteriaDocByDepth(depth);

  if (existingDoc && !existingDoc.locked) {
    const updated = await updateLayerCriteriaDoc(existingDoc.id, {
      layer_name: parsed.layer_name,
      responsibility_scope: parsed.responsibility_scope,
      considerations: parsed.considerations,
      out_of_scope: parsed.out_of_scope,
      checklist_template: JSON.stringify(parsed.checklist_template)
    });
    return updated ?? existingDoc;
  }

  return createLayerCriteriaDoc({
    id: `criteria-${depth}-${randomUUID()}`,
    depth,
    layer_name: parsed.layer_name,
    responsibility_scope: parsed.responsibility_scope,
    considerations: parsed.considerations,
    out_of_scope: parsed.out_of_scope,
    checklist_template: JSON.stringify(parsed.checklist_template),
    locked: false
  });
}

export async function approveLayerDefinition(
  depth: number,
  edits?: Partial<Omit<LayerCriteriaDoc, "id" | "depth">>
): Promise<LayerCriteriaDoc> {
  const pending = pendingDefinitionByDepth.get(depth);

  if (pending) {
    const layer_name = edits?.layer_name ?? pending.layer_name;
    const responsibility_scope = edits?.responsibility_scope ?? pending.responsibility_scope;
    const considerations = edits?.considerations ?? pending.considerations;
    const out_of_scope = edits?.out_of_scope ?? pending.out_of_scope;
    const checklist_template = edits?.checklist_template ?? JSON.stringify(pending.checklist_template);

    const existingUnlocked = await getLayerCriteriaDocByDepth(depth);
    let created: LayerCriteriaDoc;

    if (existingUnlocked && !existingUnlocked.locked) {
      const updated = await updateLayerCriteriaDoc(existingUnlocked.id, {
        layer_name,
        responsibility_scope,
        considerations,
        out_of_scope,
        checklist_template,
        locked: true
      });
      if (!updated) throw new Error(`Failed to approve layer definition at depth ${depth}.`);
      created = updated;
    } else {
      created = await createLayerCriteriaDoc({
        id: `criteria-${depth}-${randomUUID()}`,
        depth,
        layer_name,
        responsibility_scope,
        considerations,
        out_of_scope,
        checklist_template,
        locked: true
      });
    }

    await emitEvent(
      "layer_defined",
      "llm",
      {
        depth,
        layer_name: pending.layer_name,
        checklist_template: pending.checklist_template
      },
      [created.id]
    );

    const edited =
      layer_name !== pending.layer_name ||
      responsibility_scope !== pending.responsibility_scope ||
      considerations !== pending.considerations ||
      out_of_scope !== pending.out_of_scope ||
      checklist_template !== JSON.stringify(pending.checklist_template);

    if (edited) {
      await emitEvent("layer_definition_edited", "human", { depth }, [created.id]);
    }

    await emitEvent("layer_definition_approved", "human", { depth }, [created.id]);
    pendingDefinitionByDepth.delete(depth);

    const session = await getCurrentSession();
    await appendLayerToStack(session, {
      layer_name,
      responsibility_scope,
      considerations,
      out_of_scope,
      checklist_template: JSON.parse(checklist_template)
    });

    return created;
  }

  const current = await getLayerCriteriaDocByDepth(depth);

  if (!current) {
    throw new Error("No definition proposal available. Generate definition before approval.");
  }

  const patch: Partial<Omit<LayerCriteriaDoc, "id" | "depth">> = {
    layer_name: edits?.layer_name ?? current.layer_name,
    responsibility_scope: edits?.responsibility_scope ?? current.responsibility_scope,
    considerations: edits?.considerations ?? current.considerations,
    out_of_scope: edits?.out_of_scope ?? current.out_of_scope,
    checklist_template: edits?.checklist_template ?? current.checklist_template,
    locked: true
  };

  const edited =
    patch.layer_name !== current.layer_name ||
    patch.responsibility_scope !== current.responsibility_scope ||
    patch.considerations !== current.considerations ||
    patch.out_of_scope !== current.out_of_scope ||
    patch.checklist_template !== current.checklist_template;

  const updated = await updateLayerCriteriaDoc(current.id, patch);

  if (!updated) {
    throw new Error("Failed to approve layer definition.");
  }

  if (edited) {
    await emitEvent("layer_definition_edited", "human", { depth }, [updated.id]);
  }

  await emitEvent("layer_definition_approved", "human", { depth }, [updated.id]);

  const session = await getCurrentSession();
  await appendLayerToStack(session, {
    layer_name: updated.layer_name,
    responsibility_scope: updated.responsibility_scope,
    considerations: updated.considerations,
    out_of_scope: updated.out_of_scope,
    checklist_template: JSON.parse(updated.checklist_template)
  });

  return updated;
}

export async function proposeLayerNodes(depth: number): Promise<Phase2NodeView[]> {
  const spec = await requirePhase1Spec();
  const session = await getCurrentSession();
  const layers = await getSessionStackLayers(session);
  const definition = await getLayerCriteriaDocByDepth(depth);

  if (!definition || !definition.locked) {
    throw new Error("Layer definition must be approved before proposing nodes.");
  }

  const layerMeta = getCurrentLayerMeta(layers, depth);
  const layerCriteriaDoc: Prompt3Response = {
    layer_name: definition.layer_name,
    responsibility_scope: definition.responsibility_scope,
    considerations: definition.considerations,
    out_of_scope: definition.out_of_scope,
    checklist_template: JSON.parse(definition.checklist_template)
  };

  const parents: Array<{ id: string; intent: string; inputs: string; outputs: string } | { id: "root"; intent: string }> = [];
  if (depth === 0) {
    parents.push({ id: "root", intent: spec.problem_statement });
  } else {
    const allParentNodes = await getNodesByDepth(depth - 1);
    const parentNodes = allParentNodes.filter((n) => n.leaf !== true);

    if (parentNodes.length === 0) {
      throw new Error(
        `No decomposable nodes at depth ${depth - 1}. All nodes are confirmed leaf nodes.`
      );
    }

    for (const parentNode of parentNodes) {
      parents.push({
        id: parentNode.id,
        intent: parentNode.intent,
        inputs: parentNode.inputs,
        outputs: parentNode.outputs
      });
    }
  }

  const parentEdgesByParent = new Map<string, Array<{ peer: string; interface: string; direction: string }>>();
  if (depth > 0) {
    const parentDepthEdges = await getEdgesByDepth(depth - 1);
    for (const edge of parentDepthEdges) {
      for (const [nodeId, peerId] of [[edge.source, edge.target], [edge.target, edge.source]]) {
        if (!parentEdgesByParent.has(nodeId)) parentEdgesByParent.set(nodeId, []);
        parentEdgesByParent.get(nodeId)!.push({
          peer: peerId,
          interface: edge.interface,
          direction: edge.direction
        });
      }
    }
  }

  const allProposedNodes: Prompt4Response["nodes"] = [];

  for (const parent of parents) {
    const existingNodesAtDepth = allProposedNodes.map((node) => ({
      id: node.id,
      intent: node.intent,
      inputs: node.inputs,
      outputs: node.outputs,
      parents: node.parents
    }));

    const raw = await callLLMWithMessages<Record<string, unknown>>(
      buildSimpleMessages(
        prompt4System({
          layerName: layerMeta.layerName,
          depth,
          totalLayers: layerMeta.totalLayers,
          layerDescription: layerMeta.layerDescription
        }),
        prompt4User({
          spec,
          stack: layers,
          depth,
          parent,
          layerCriteriaDoc,
          existingNodesAtDepth,
          parentEdges: parentEdgesByParent.get(parent.id) ?? []
        })
      )
    );

    const parsed = validatePrompt4(raw);
    allProposedNodes.push(...parsed.nodes);
  }

  pendingNodesByDepth.set(depth, allProposedNodes);

  return allProposedNodes.map((node) => ({
    id: node.id,
    intent: node.intent,
    parents: node.parents,
    inputs: node.inputs,
    outputs: node.outputs,
    edges: node.edges,
    checklist: node.checklist.map((item) => item.item),
    state: "pending",
    leaf: null
  }));
}

async function processProposedNodes(
  depth: number,
  nodes: Prompt4Response["nodes"],
  spec: ProblemSpec
): Promise<void> {
  const edgeDedup = new Set<string>();

  for (const nodeInput of nodes) {
    if (nodeInput.claimed_from) {
      const existing = await getArchNodeById(nodeInput.claimed_from);

      if (!existing) throw new Error(`Claimed node ${nodeInput.claimed_from} not found.`);

      const hasEdits =
        nodeInput.proposed_edits !== null &&
        (nodeInput.proposed_edits?.intent || nodeInput.proposed_edits?.inputs || nodeInput.proposed_edits?.outputs);

      if (hasEdits) {
        const proposedEdits = nodeInput.proposed_edits ?? {};
        const editedNode = {
          id: existing.id,
          intent: proposedEdits.intent ?? existing.intent,
          inputs: proposedEdits.inputs ?? existing.inputs,
          outputs: proposedEdits.outputs ?? existing.outputs
        };
        const passed = await runClaimValidation(spec, editedNode, existing.parents, depth);

        if (!passed) {
          const newId = `${existing.id}-fork-${randomUUID().slice(0, 8)}`;
          await createArchNode({
            id: newId,
            intent: editedNode.intent,
            state: "pending",
            depth,
            parents: nodeInput.parents,
            children: [],
            edges: [],
            inputs: editedNode.inputs,
            outputs: editedNode.outputs
          });
          await emitEvent(
            "node_claim_rejected",
            "llm",
            {
              depth,
              claimed_node_id: existing.id,
              requested_by_parents: nodeInput.parents,
              proposed_edits: nodeInput.proposed_edits,
              new_node_id: newId
            },
            [existing.id, newId]
          );
          if (nodeInput.checklist.length) {
            await createNodeChecklistDraft({
              id: `draft-${randomUUID()}`,
              depth,
              node_id: newId,
              checklist: JSON.stringify(nodeInput.checklist),
              approved: false
            });
            await emitEvent(
              "node_checklist_generated",
              "llm",
              { depth, node_id: newId, checklist: nodeInput.checklist },
              [newId]
            );
          }
          continue;
        }

        const updates: {
          parents: string[];
          intent?: string;
          inputs?: string;
          outputs?: string;
        } = { parents: [...new Set([...existing.parents, ...nodeInput.parents])] as string[] };
        if (proposedEdits.intent) updates.intent = proposedEdits.intent;
        if (proposedEdits.inputs) updates.inputs = proposedEdits.inputs;
        if (proposedEdits.outputs) updates.outputs = proposedEdits.outputs;
        await updateArchNode(existing.id, updates);
        await emitEvent(
          "node_claimed",
          "llm",
          {
            depth,
            node_id: existing.id,
            claimed_by_parent: nodeInput.parents,
            proposed_edits: nodeInput.proposed_edits
          },
          [existing.id]
        );
      } else {
        const allParents = [...new Set([...existing.parents, ...nodeInput.parents])];
        const passed = await runClaimValidation(
          spec,
          {
            id: existing.id,
            intent: existing.intent,
            inputs: existing.inputs,
            outputs: existing.outputs
          },
          allParents,
          depth
        );

        if (!passed) {
          await emitEvent(
            "node_claim_rejected",
            "llm",
            {
              depth,
              claimed_node_id: existing.id,
              requested_by_parents: nodeInput.parents,
              proposed_edits: null,
              new_node_id: null
            },
            [existing.id]
          );
          continue;
        }

        await updateArchNode(existing.id, { parents: allParents });
        await emitEvent(
          "node_claimed",
          "llm",
          {
            depth,
            node_id: existing.id,
            claimed_by_parent: nodeInput.parents,
            proposed_edits: null
          },
          [existing.id]
        );
      }

      continue;
    }

    await createArchNode({
      id: nodeInput.id,
      intent: nodeInput.intent,
      state: "pending",
      depth,
      parents: nodeInput.parents,
      children: [],
      edges: [],
      inputs: nodeInput.inputs,
      outputs: nodeInput.outputs
    });

    await emitEvent("node_proposed", "llm", { depth, node_id: nodeInput.id }, [nodeInput.id]);

    await createNodeChecklistDraft({
      id: `draft-${randomUUID()}`,
      depth,
      node_id: nodeInput.id,
      checklist: JSON.stringify(nodeInput.checklist),
      approved: false
    });

    await emitEvent(
      "node_checklist_generated",
      "llm",
      { depth, node_id: nodeInput.id, checklist: nodeInput.checklist },
      [nodeInput.id]
    );

    for (const edge of nodeInput.edges) {
      const pairKey = [nodeInput.id, edge.target].sort().join("::");
      const edgeKey = `${pairKey}::${edge.interface}::${edge.direction}`;

      if (edgeDedup.has(edgeKey)) {
        continue;
      }

      edgeDedup.add(edgeKey);

      const edgeId = `edge-${randomUUID()}`;

      await createArchEdge({
        id: edgeId,
        source: nodeInput.id,
        target: edge.target,
        interface: edge.interface,
        direction: edge.direction
      });

      await emitEvent(
        "edge_proposed",
        "llm",
        {
          edge_id: edgeId,
          source: nodeInput.id,
          target: edge.target,
          interface: edge.interface,
          direction: edge.direction,
          depth
        },
        [nodeInput.id, edge.target]
      );
    }
  }
}

export async function approveLayerNodes(depth: number): Promise<{ approved: true }> {
  const spec = await requirePhase1Spec();
  const pendingNodes = pendingNodesByDepth.get(depth);

  if (pendingNodes?.length) {
    await processProposedNodes(depth, pendingNodes, spec);

    pendingNodesByDepth.delete(depth);
  } else {
    const existingNodes = await getNodesByDepth(depth);
    if (!existingNodes.length) {
      throw new Error(`No nodes proposed for depth ${depth}. Call proposeLayerNodes first.`);
    }
  }

  const drafts = await getNodeChecklistDraftsByDepth(depth);

  for (const draft of drafts) {
    await updateNodeChecklistDraft(draft.id, { approved: true });
    await emitEvent("node_checklist_approved", "human", { depth, node_id: draft.node_id }, [draft.node_id]);
  }

  return { approved: true };
}

export async function reproposeParent(
  depth: number,
  parentId: string
): Promise<Phase2NodeView[]> {
  const spec = await requirePhase1Spec();
  const session = await getCurrentSession();
  const layers = await getSessionStackLayers(session);
  const definition = await getLayerCriteriaDocByDepth(depth);

  if (!definition || !definition.locked) {
    throw new Error("Layer definition must be approved before proposing nodes.");
  }

  const layerMeta = getCurrentLayerMeta(layers, depth);
  const layerCriteriaDoc: Prompt3Response = {
    layer_name: definition.layer_name,
    responsibility_scope: definition.responsibility_scope,
    considerations: definition.considerations,
    out_of_scope: definition.out_of_scope,
    checklist_template: JSON.parse(definition.checklist_template)
  };

  let parent: { id: string; intent: string; inputs: string; outputs: string } | { id: "root"; intent: string };
  if (parentId === "root") {
    parent = { id: "root", intent: spec.problem_statement };
  } else {
    const parentNode = await getArchNodeById(parentId);
    if (!parentNode) throw new Error(`Parent node ${parentId} not found.`);
    parent = {
      id: parentNode.id,
      intent: parentNode.intent,
      inputs: parentNode.inputs,
      outputs: parentNode.outputs
    };
  }

  const existingNodes = await getNodesByDepth(depth);
  const existingNodesAtDepth = existingNodes.map((n) => ({
    id: n.id,
    intent: n.intent,
    inputs: n.inputs,
    outputs: n.outputs,
    parents: n.parents
  }));

  let parentEdges: Array<{ peer: string; interface: string; direction: string }> = [];
  if (depth > 0 && parentId !== "root") {
    const parentDepthEdges = await getEdgesByDepth(depth - 1);
    parentEdges = parentDepthEdges
      .filter((e) => e.source === parentId || e.target === parentId)
      .map((e) => ({
        peer: e.source === parentId ? e.target : e.source,
        interface: e.interface,
        direction: e.direction
      }));
  }

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt4System({
        layerName: layerMeta.layerName,
        depth,
        totalLayers: layerMeta.totalLayers,
        layerDescription: layerMeta.layerDescription
      }),
      prompt4User({
        spec,
        stack: layers,
        depth,
        parent,
        layerCriteriaDoc,
        existingNodesAtDepth,
        parentEdges
      })
    )
  );

  const parsed = validatePrompt4(raw);

  const existing = pendingReproposeByDepth.get(depth) ?? [];
  pendingReproposeByDepth.set(depth, [...existing, ...parsed.nodes]);

  return parsed.nodes.map((node) => ({
    id: node.id,
    intent: node.intent,
    parents: node.parents,
    inputs: node.inputs,
    outputs: node.outputs,
    edges: node.edges,
    checklist: node.checklist.map((item) => item.item),
    state: "pending",
    leaf: null
  }));
}

export async function approveReproposeParent(depth: number): Promise<{ approved: true }> {
  const spec = await requirePhase1Spec();
  const pendingNodes = pendingReproposeByDepth.get(depth);

  if (!pendingNodes?.length) {
    throw new Error(`No re-proposed nodes for depth ${depth}. Call reproposeParent first.`);
  }

  await processProposedNodes(depth, pendingNodes, spec);
  pendingReproposeByDepth.delete(depth);

  const drafts = await getNodeChecklistDraftsByDepth(depth);
  const reproposeNodeIds = new Set(pendingNodes.map((n) => n.id));

  for (const draft of drafts) {
    if (reproposeNodeIds.has(draft.node_id) && !draft.approved) {
      await updateNodeChecklistDraft(draft.id, { approved: true });
      await emitEvent("node_checklist_approved", "human", { depth, node_id: draft.node_id }, [draft.node_id]);
    }
  }

  return { approved: true };
}

export async function validateNode(depth: number, nodeId: string): Promise<Prompt5Response> {
  const spec = await requirePhase1Spec();

  const allNodes = await getNodesByDepth(depth);
  const node = allNodes.find((n) => n.id === nodeId);

  if (!node) {
    throw new Error(`Node ${nodeId} not found at depth ${depth}.`);
  }

  const parentNodes = await getNodeParents(nodeId);
  const siblings = await getNodeSiblings(nodeId);
  const neighbours = await getNodeNeighbours(nodeId);

  const drafts = await getNodeChecklistDraftsByDepth(depth);
  const draft = drafts.find((d) => d.node_id === nodeId);
  const checklist = draft ? parseChecklist(draft.checklist) : [];

  if (!checklist.length) {
    throw new Error(`No checklist found for node ${nodeId}.`);
  }

  const allEdges = await getEdgesByDepth(depth);
  const nodeEdges = allEdges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .map((e) => ({
      target: e.source === nodeId ? e.target : e.source,
      interface: e.interface,
      direction: e.direction
    }));

  await emitEvent("node_validation_attempted", "llm", { depth, node_id: nodeId }, [nodeId]);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt5System(),
      prompt5User({
        spec,
        node: {
          id: node.id,
          intent: node.intent,
          inputs: node.inputs,
          outputs: node.outputs,
          edges: nodeEdges
        },
        parentNodes: parentNodes.map((p) => ({
          id: p.id,
          intent: p.intent,
          inputs: p.inputs,
          outputs: p.outputs
        })),
        siblings: siblings.map((s) => ({
          id: s.id,
          intent: s.intent,
          inputs: s.inputs,
          outputs: s.outputs
        })),
        neighbours: neighbours.map((n) => ({
          id: n.id,
          intent: n.intent,
          inputs: n.inputs,
          outputs: n.outputs
        })),
        checklist
      })
    )
  );

  const result = validatePrompt5(raw);

  if (result.passed) {
    await emitEvent("node_validation_passed", "llm", { depth, node_id: nodeId, results: result.results }, [nodeId]);
  } else {
    await emitEvent("node_validation_failed", "llm", { depth, node_id: nodeId, results: result.results }, [nodeId]);
  }

  return result;
}

export async function runLayerSyntaxCheck(depth: number): Promise<SyntaxCheckResult> {
  const nodesAtDepth = await getNodesByDepth(depth);

  if (!nodesAtDepth.length) {
    throw new Error(`No nodes found at depth ${depth}.`);
  }

  const edges = await getEdgesByDepth(depth);

  await emitEvent("syntax_check_attempted", "llm", { depth }, []);

  const allNodes: typeof nodesAtDepth = [];
  for (let d = 0; d <= depth; d += 1) {
    const atD = await getNodesByDepth(d);
    allNodes.push(...atD);
  }

  const result = runSyntaxCheck(nodesAtDepth, edges, allNodes);

  if (result.passed) {
    await emitEvent("syntax_check_passed", "llm", { depth }, []);
  } else {
    await emitEvent("syntax_check_failed", "llm", { depth, errors: result.errors }, []);
  }

  return result;
}

export async function runCollectiveVerticalCheck(depth: number): Promise<Prompt6Response> {
  const spec = await requirePhase1Spec();
  const nodes = await getNodesByDepth(depth);

  if (!nodes.length) {
    throw new Error(`No nodes found at depth ${depth}.`);
  }

  const parents: Array<{ id: string; intent: string; inputs: string; outputs: string }> =
    depth === 0
      ? [{ id: "root", intent: spec.problem_statement, inputs: "", outputs: "" }]
      : (await getNodesByDepth(depth - 1)).map((p) => ({
          id: p.id,
          intent: p.intent,
          inputs: p.inputs,
          outputs: p.outputs
        }));

  const siblings = nodes.map((n) => ({
    id: n.id,
    intent: n.intent,
    inputs: n.inputs,
    outputs: n.outputs,
    parents: n.parents
  }));

  const layerDefinition = await getLayerCriteriaDocByDepth(depth);
  if (!layerDefinition) {
    throw new Error(`No layer definition found at depth ${depth}.`);
  }

  const layerCriteriaDoc: Prompt3Response = {
    layer_name: layerDefinition.layer_name,
    responsibility_scope: layerDefinition.responsibility_scope,
    considerations: layerDefinition.considerations,
    out_of_scope: layerDefinition.out_of_scope,
    checklist_template: JSON.parse(layerDefinition.checklist_template)
  };

  await emitEvent("collective_vertical_attempted", "llm", { depth }, []);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt6System(),
      prompt6User({
        spec,
        depth,
        parents,
        siblings,
        layerCriteriaDoc
      })
    )
  );

  const result = validatePrompt6(raw);

  if (result.passed) {
    await emitEvent("collective_vertical_passed", "llm", { depth }, []);
  } else {
    await emitEvent(
      "collective_vertical_failed",
      "llm",
      { depth, coverage: result.coverage, overlaps: result.overlaps },
      []
    );
  }

  return result;
}

export async function runEdgeValidation(depth: number): Promise<Prompt10Response> {
  const spec = await requirePhase1Spec();
  const nodes = await getNodesByDepth(depth);

  if (!nodes.length) {
    throw new Error(`No nodes found at depth ${depth}.`);
  }

  const edges = await getEdgesByDepth(depth);
  const layerDefinition = await getLayerCriteriaDocByDepth(depth);
  if (!layerDefinition) {
    throw new Error(`No layer definition found at depth ${depth}.`);
  }

  const layerCriteriaDoc: Prompt3Response = {
    layer_name: layerDefinition.layer_name,
    responsibility_scope: layerDefinition.responsibility_scope,
    considerations: layerDefinition.considerations,
    out_of_scope: layerDefinition.out_of_scope,
    checklist_template: JSON.parse(layerDefinition.checklist_template)
  };

  await emitEvent("edge_validation_attempted", "llm", { depth }, []);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt10System(),
      prompt10User({
        spec,
        depth,
        nodes: nodes.map((n) => ({ id: n.id, intent: n.intent, inputs: n.inputs, outputs: n.outputs })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, interface: e.interface, direction: e.direction })),
        layerCriteriaDoc
      })
    )
  );

  const result = validatePrompt10(raw);

  if (result.passed) {
    await emitEvent("edge_validation_passed", "llm", { depth }, []);
  } else {
    await emitEvent("edge_validation_failed", "llm", { depth, edge_results: result.edge_results, missing_edges: result.missing_edges }, []);
  }

  return result;
}

export async function lockLayer(depth: number): Promise<{ locked: true; node_count: number }> {
  const nodes = await getNodesByDepth(depth);

  if (!nodes.length) {
    throw new Error(`No nodes found at depth ${depth}.`);
  }

  const edgeEvents = await getEventsByType("edge_validation_passed");
  const edgePassed = edgeEvents.some((e) => {
    try {
      return (JSON.parse(e.payload) as Record<string, unknown>).depth === depth;
    } catch {
      return false;
    }
  });
  if (!edgePassed) {
    throw new Error(
      `Cannot lock layer ${depth}: edge validation has not passed. Run runEdgeValidation first.`
    );
  }

  const collectiveEvents = await getEventsByType("collective_vertical_passed");
  const collectivePassed = collectiveEvents.some((e) => {
    try {
      return (JSON.parse(e.payload) as Record<string, unknown>).depth === depth;
    } catch {
      return false;
    }
  });
  if (!collectivePassed) {
    throw new Error(
      `Cannot lock layer ${depth}: collective vertical check has not passed. Run runCollectiveVerticalCheck first.`
    );
  }

  const syntaxEvents = await getEventsByType("syntax_check_passed");
  const syntaxPassed = syntaxEvents.some((e) => {
    try {
      return (JSON.parse(e.payload) as Record<string, unknown>).depth === depth;
    } catch {
      return false;
    }
  });
  if (!syntaxPassed) {
    throw new Error(
      `Cannot lock layer ${depth}: syntax check has not passed. Run runLayerSyntaxCheck first.`
    );
  }

  const blockingNodes: string[] = [];
  for (const node of nodes) {
    const events = await getEventsByNodeId(node.id);
    const latestValidation = [...events]
      .reverse()
      .find((e) => e.type === "node_validation_passed" || e.type === "node_validation_failed");
    if (!latestValidation || latestValidation.type !== "node_validation_passed") {
      blockingNodes.push(node.id);
    }
  }
  if (blockingNodes.length > 0) {
    throw new Error(
      `Cannot lock layer ${depth}: ${blockingNodes.length} node(s) have not passed validation: ${blockingNodes.join(", ")}`
    );
  }

  for (const node of nodes) {
    await updateArchNode(node.id, { state: "locked" });
    await emitEvent("node_locked", "llm", { depth, node_id: node.id }, [node.id]);
  }

  await emitEvent("layer_locked", "llm", { depth }, []);

  const session = await getCurrentSession();
  await updateSession(session.id, { current_depth: depth + 1 });

  return { locked: true, node_count: nodes.length };
}

export async function determineLeafNodes(depth: number): Promise<LeafDeterminationResponse> {
  const spec = await requirePhase1Spec();
  const nodes = (await getNodesByDepth(depth)).filter((n) => n.state === "locked");

  if (!nodes.length) {
    throw new Error(`No nodes found at depth ${depth}.`);
  }

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      promptLeafSystem(),
      promptLeafUser({
        spec,
        depth,
        nodes: nodes.map((node) => ({
          id: node.id,
          intent: node.intent,
          inputs: node.inputs,
          outputs: node.outputs
        }))
      })
    )
  );

  const result = validateLeafDeterminationResponse(raw);

  for (const entry of result.nodes) {
    await emitEvent(
      "node_leaf_determined",
      "llm",
      {
        depth,
        node_id: entry.node_id,
        determination: entry.determination,
        reasoning: entry.reasoning
      },
      [entry.node_id]
    );
  }

  pendingLeafByDepth.set(depth, result);

  const doc = await getLayerCriteriaDocByDepth(depth);
  if (doc) {
    await updateLayerCriteriaDoc(doc.id, {
      pending_leaf_determinations: JSON.stringify(result)
    });
  }

  return result;
}

export async function confirmLeafNodes(
  depth: number,
  overrides?: Record<string, "leaf" | "decompose_further">
): Promise<LeafDeterminationResponse> {
  const inMemory = pendingLeafByDepth.get(depth);
  let base: LeafDeterminationResponse;

  if (!inMemory) {
    const doc = await getLayerCriteriaDocByDepth(depth);
    if (!doc?.pending_leaf_determinations) {
      throw new Error(`No pending leaf determination for depth ${depth}. Call determineLeafNodes first.`);
    }
    base = JSON.parse(doc.pending_leaf_determinations) as LeafDeterminationResponse;
  } else {
    base = inMemory;
  }

  const resolved: LeafDeterminationResponse = {
    nodes: base.nodes.map((entry) => {
      const override = overrides?.[entry.node_id];
      const determination =
        override === "leaf" || override === "decompose_further" ? override : entry.determination;

      return {
        node_id: entry.node_id,
        determination,
        reasoning: entry.reasoning
      };
    })
  };

  for (const entry of resolved.nodes) {
    await updateArchNode(entry.node_id, { leaf: entry.determination === "leaf" });
    await emitEvent(
      "node_leaf_confirmed",
      "human",
      {
        depth,
        node_id: entry.node_id,
        determination: entry.determination,
        overridden: overrides?.[entry.node_id] !== undefined
      },
      [entry.node_id]
    );
  }

  const doc = await getLayerCriteriaDocByDepth(depth);
  if (doc) {
    await updateLayerCriteriaDoc(doc.id, { pending_leaf_determinations: null });
  }

  pendingLeafByDepth.delete(depth);

  return resolved;
}

async function getAllNodes(): Promise<ArchNode[]> {
  const all: ArchNode[] = [];
  let emptyStreak = 0;

  for (let depth = 0; emptyStreak < 2; depth += 1) {
    const atDepth = await getNodesByDepth(depth);
    if (atDepth.length === 0) {
      emptyStreak += 1;
    } else {
      emptyStreak = 0;
      all.push(...atDepth);
    }
  }

  return all;
}

export async function getExitCheckStatus(): Promise<{ complete: boolean; decompose_further_ids: string[] }> {
  const allNodes = await getAllNodes();

  const childrenMap = new Map<string, string[]>();
  for (const node of allNodes) {
    for (const parentId of node.parents) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(node.id);
    }
  }

  const decompose_further_ids = allNodes
    .filter((node) => node.state === "locked" && node.leaf !== true && !childrenMap.has(node.id))
    .map((node) => node.id);

  return {
    complete: decompose_further_ids.length === 0,
    decompose_further_ids
  };
}

export async function lockPhase2(): Promise<{ locked: true }> {
  const status = await getExitCheckStatus();

  if (!status.complete) {
    throw new Error(
      `Phase 2 is not complete - ${status.decompose_further_ids.length} non-leaf nodes still need decomposition.`
    );
  }

  await emitEvent("phase2_locked", "human", {}, []);

  return { locked: true };
}

export async function diagnoseNode(nodeId: string): Promise<Prompt7Response> {
  const spec = await requirePhase1Spec();

  const node = await getArchNodeById(nodeId);

  if (!node) {
    throw new Error(`Node ${nodeId} not found.`);
  }

  const parentNodes = await getNodeParents(nodeId);
  const siblings = await getNodeSiblings(nodeId);
  const neighbours = await getNodeNeighbours(nodeId);

  const drafts = await getNodeChecklistDraftsByDepth(node.depth);
  const draft = drafts.find((d) => d.node_id === nodeId);
  const checklist = draft ? parseChecklist(draft.checklist) : [];

  if (!checklist.length) {
    throw new Error(`No checklist found for node ${nodeId}.`);
  }

  const events = await getEventsByNodeId(nodeId);
  const failedValidationEvents = events.filter((event) => event.type === "node_validation_failed");
  const latestFailedValidation = failedValidationEvents[failedValidationEvents.length - 1];

  if (!latestFailedValidation) {
    throw new Error(`No failed validation found for node ${nodeId}.`);
  }

  let failedResults: Array<{ item: string; passed: boolean; reasoning: string }> = [];
  try {
    const payload = JSON.parse(latestFailedValidation.payload) as Record<string, unknown>;
    failedResults = Array.isArray(payload.results)
      ? payload.results
          .map((entry) => {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
              return null;
            }

            const e = entry as Record<string, unknown>;
            const item = typeof e.item === "string" ? e.item : "";
            const passed = typeof e.passed === "boolean" ? e.passed : false;
            const reasoning = typeof e.reasoning === "string" ? e.reasoning : "";

            if (!item || !reasoning) {
              return null;
            }

            return { item, passed, reasoning };
          })
          .filter((r): r is { item: string; passed: boolean; reasoning: string } => r !== null)
      : [];
  } catch {
    failedResults = [];
  }

  const layerDefinition = await getLayerCriteriaDocByDepth(node.depth);
  if (!layerDefinition) {
    throw new Error(`No layer definition found at depth ${node.depth}.`);
  }

  const layerCriteriaDoc: Prompt3Response = {
    layer_name: layerDefinition.layer_name,
    responsibility_scope: layerDefinition.responsibility_scope,
    considerations: layerDefinition.considerations,
    out_of_scope: layerDefinition.out_of_scope,
    checklist_template: JSON.parse(layerDefinition.checklist_template)
  };

  const session = await getCurrentSession();
  const stack = await getSessionStackLayers(session);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt7System(),
      prompt7User({
        spec,
        node: {
          id: node.id,
          intent: node.intent,
          inputs: node.inputs,
          outputs: node.outputs
        },
        failedResults,
        parentNodes: parentNodes.map((p) => ({
          id: p.id,
          intent: p.intent,
          inputs: p.inputs,
          outputs: p.outputs
        })),
        siblings: siblings.map((s) => ({
          id: s.id,
          intent: s.intent,
          inputs: s.inputs,
          outputs: s.outputs
        })),
        neighbours: neighbours.map((n) => ({
          id: n.id,
          intent: n.intent,
          inputs: n.inputs,
          outputs: n.outputs
        })),
        layerCriteriaDoc,
        stack
      })
    )
  );

  const result = validatePrompt7(raw);

  await emitEvent(
    "failure_diagnosed",
    "llm",
    {
      node_id: nodeId,
      classification: result.classification,
      origin_nodes: result.origin_nodes,
      suggested_action: result.suggested_action
    },
    [nodeId]
  );

  return result;
}

export async function rewriteNode(
  nodeId: string
): Promise<{ rewritten: PromptRewriteResponse; validation: Prompt5Response }> {
  const spec = await requirePhase1Spec();

  const node = await getArchNodeById(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found.`);

  const parentNodes = await getNodeParents(nodeId);
  const siblings = await getNodeSiblings(nodeId);

  const drafts = await getNodeChecklistDraftsByDepth(node.depth);
  const draft = drafts.find((d) => d.node_id === nodeId);
  const checklist = draft ? parseChecklist(draft.checklist) : [];

  if (!checklist.length) throw new Error(`No checklist found for node ${nodeId}.`);

  const events = await getEventsByNodeId(nodeId);
  const latestFailedValidation = [...events]
    .reverse()
    .find((e) => e.type === "node_validation_failed");

  if (!latestFailedValidation) {
    throw new Error(
      `No failed validation found for node ${nodeId}. Run validateNode first.`
    );
  }

  let failedResults: Array<{ item: string; passed: boolean; reasoning: string }> = [];
  try {
    const payload = JSON.parse(latestFailedValidation.payload) as Record<string, unknown>;
    failedResults = Array.isArray(payload.results)
      ? payload.results
          .map((entry) => {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
            const e = entry as Record<string, unknown>;
            const item = typeof e.item === "string" ? e.item : "";
            const passed = typeof e.passed === "boolean" ? e.passed : false;
            const reasoning = typeof e.reasoning === "string" ? e.reasoning : "";
            if (!item || !reasoning) return null;
            return { item, passed, reasoning };
          })
          .filter((r): r is { item: string; passed: boolean; reasoning: string } => r !== null)
      : [];
  } catch {
    failedResults = [];
  }

  const layerDefinition = await getLayerCriteriaDocByDepth(node.depth);
  if (!layerDefinition) throw new Error(`No layer definition found at depth ${node.depth}.`);

  const layerCriteriaDoc: Prompt3Response = {
    layer_name: layerDefinition.layer_name,
    responsibility_scope: layerDefinition.responsibility_scope,
    considerations: layerDefinition.considerations,
    out_of_scope: layerDefinition.out_of_scope,
    checklist_template: JSON.parse(layerDefinition.checklist_template)
  };

  const session = await getCurrentSession();
  const stack = await getSessionStackLayers(session);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      promptRewriteSystem(),
      promptRewriteUser({
        spec,
        node: { id: node.id, intent: node.intent, inputs: node.inputs, outputs: node.outputs },
        parentNodes: parentNodes.map((p) => ({
          id: p.id, intent: p.intent, inputs: p.inputs, outputs: p.outputs
        })),
        siblings: siblings.map((s) => ({
          id: s.id, intent: s.intent, inputs: s.inputs, outputs: s.outputs
        })),
        failedResults,
        layerCriteriaDoc,
        stack
      })
    )
  );

  const rewritten = validatePromptRewrite(raw);
  const old = { intent: node.intent, inputs: node.inputs, outputs: node.outputs };

  await updateArchNode(nodeId, {
    intent: rewritten.intent,
    inputs: rewritten.inputs,
    outputs: rewritten.outputs
  });

  await emitEvent(
    "node_rewritten",
    "llm",
    { node_id: nodeId, old, rewritten },
    [nodeId]
  );

  const validation = await validateNode(node.depth, nodeId);

  return { rewritten, validation };
}

export async function editNode(
  nodeId: string,
  fields: { intent?: string; inputs?: string; outputs?: string }
): Promise<ArchNode> {
  if (!fields.intent && !fields.inputs && !fields.outputs) {
    throw new Error("At least one of intent, inputs, or outputs must be provided.");
  }

  const node = await getArchNodeById(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found.`);

  const updates: { intent?: string; inputs?: string; outputs?: string } = {};
  if (fields.intent !== undefined) updates.intent = fields.intent.trim();
  if (fields.inputs !== undefined) updates.inputs = fields.inputs.trim();
  if (fields.outputs !== undefined) updates.outputs = fields.outputs.trim();

  const emptyFields = Object.entries(updates)
    .filter(([, v]) => typeof v === "string" && v.length === 0)
    .map(([k]) => k);

  if (emptyFields.length > 0) {
    throw new Error(`Field(s) cannot be empty after trimming: ${emptyFields.join(", ")}`);
  }

  const updated = await updateArchNode(nodeId, updates);
  if (!updated) throw new Error(`Failed to update node ${nodeId}.`);

  await emitEvent(
    "human_override",
    "human",
    { node_id: nodeId, changes: updates },
    [nodeId]
  );

  return updated;
}

export async function confirmDiagnosis(
  nodeId: string,
  override?: Partial<Pick<Prompt7Response, "classification" | "origin_nodes" | "suggested_action">>
): Promise<Prompt7Response> {
  const events = await getEventsByNodeId(nodeId);
  const diagnosisEvent = [...events].reverse().find((e) => e.type === "failure_diagnosed");

  if (!diagnosisEvent) {
    throw new Error(`No diagnosis found for node ${nodeId}. Call diagnoseNode first.`);
  }

  let baseParsed: Prompt7Response;
  try {
    const payload = JSON.parse(diagnosisEvent.payload) as Record<string, unknown>;
    baseParsed = {
      classification:
        payload.classification === "design" || payload.classification === "implementation"
          ? payload.classification
          : "implementation",
      reasoning: typeof payload.reasoning === "string" ? payload.reasoning : "",
      origin_nodes: Array.isArray(payload.origin_nodes)
        ? payload.origin_nodes.filter((id): id is string => typeof id === "string")
        : [],
      suggested_action:
        typeof payload.suggested_action === "string" ? payload.suggested_action : ""
    };
  } catch {
    throw new Error(`Failed to parse diagnosis for node ${nodeId}.`);
  }

  const resolved: Prompt7Response = {
    classification: override?.classification === "design" || override?.classification === "implementation"
      ? override.classification
      : baseParsed.classification,
    reasoning: baseParsed.reasoning,
    origin_nodes: Array.isArray(override?.origin_nodes)
      ? override.origin_nodes.filter((id): id is string => typeof id === "string")
      : baseParsed.origin_nodes,
    suggested_action:
      typeof override?.suggested_action === "string" ? override.suggested_action : baseParsed.suggested_action
  };

  const wasOverridden =
    (override?.classification !== undefined && override.classification !== baseParsed.classification) ||
    override?.origin_nodes !== undefined ||
    (override?.suggested_action !== undefined && override.suggested_action !== baseParsed.suggested_action);

  if (wasOverridden) {
    await emitEvent(
      "diagnosis_overridden",
      "human",
      {
        classification: resolved.classification,
        reasoning: resolved.reasoning,
        origin_nodes: resolved.origin_nodes,
        suggested_action: resolved.suggested_action
      },
      [nodeId]
    );
  } else {
    await emitEvent(
      "diagnosis_confirmed",
      "human",
      {
        classification: resolved.classification,
        reasoning: resolved.reasoning,
        origin_nodes: resolved.origin_nodes,
        suggested_action: resolved.suggested_action
      },
      [nodeId]
    );
  }

  return resolved;
}

export async function traverseUpward(originNodeIds: string[]): Promise<{ invalidated: string[] }> {
  await emitEvent("upward_traversal_triggered", "human", { origin_nodes: originNodeIds }, []);

  const allNodes = await getAllNodes();

  const childrenMap = new Map<string, string[]>();
  for (const node of allNodes) {
    for (const parentId of node.parents) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(node.id);
    }
  }

  const toInvalidate = new Set<string>();
  for (const originId of originNodeIds) {
    const stack = [originId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (toInvalidate.has(current)) {
        continue;
      }

      toInvalidate.add(current);
      const children = childrenMap.get(current) ?? [];
      for (const child of children) {
        stack.push(child);
      }
    }
  }

  const invalidated = Array.from(toInvalidate);

  for (const id of invalidated) {
    await updateArchNode(id, { state: "invalidated" });
    await emitEvent("node_invalidated", "llm", { node_id: id, origin_nodes: originNodeIds }, [id]);
  }

  await emitEvent("upward_traversal_completed", "llm", { origin_nodes: originNodeIds, invalidated }, []);

  return { invalidated };
}

