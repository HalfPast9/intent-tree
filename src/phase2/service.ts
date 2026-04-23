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
import { callLLMWithMessages } from "../llm/client.js";
import { EventActor } from "../models/event.js";
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
  Prompt3Response,
  Prompt4Response,
  Prompt5Response,
  Prompt6Response,
  Prompt7Response,
  StackLayerInput
} from "./prompts.js";
import { runSyntaxCheck, SyntaxCheckResult } from "./syntaxChecker.js";

const SESSION_ID = "default-session";
const PHASE1_SPEC_ID = "spec-url-shortener";

const pendingDefinitionByDepth = new Map<number, Prompt3Response>();
const pendingNodesByDepth = new Map<number, Prompt4Response["nodes"]>();
const pendingLeafByDepth = new Map<number, LeafDeterminationResponse>();

export interface Phase2NodeView {
  id: string;
  intent: string;
  parents: string[];
  inputs: string;
  outputs: string;
  edges: Array<{ target: string; interface: string; direction: "directed" | "bidirectional" }>;
  checklist: Array<{ item: string; context: string }>;
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

export async function getOrCreateLayerDefinition(depth: number): Promise<LayerCriteriaDoc> {
  await requirePhase1Spec();
  const existing = await getLayerCriteriaDocByDepth(depth);

  if (existing) {
    return existing;
  }

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

  const created = await createLayerCriteriaDoc({
    id: `criteria-${depth}-${randomUUID()}`,
    depth,
    layer_name: parsed.layer_name,
    responsibility_scope: parsed.responsibility_scope,
    considerations: parsed.considerations,
    out_of_scope: parsed.out_of_scope,
    checklist_template: JSON.stringify(parsed.checklist_template),
    locked: false
  });

  await emitEvent(
    "layer_defined",
    "llm",
    {
      depth,
      layer_name: parsed.layer_name,
      checklist_template: parsed.checklist_template
    },
    [created.id]
  );

  return created;
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

  return {
    id: `criteria-${depth}-pending`,
    depth,
    layer_name: parsed.layer_name,
    responsibility_scope: parsed.responsibility_scope,
    considerations: parsed.considerations,
    out_of_scope: parsed.out_of_scope,
    checklist_template: JSON.stringify(parsed.checklist_template),
    locked: false
  };
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

    const created = await createLayerCriteriaDoc({
      id: `criteria-${depth}-${randomUUID()}`,
      depth,
      layer_name,
      responsibility_scope,
      considerations,
      out_of_scope,
      checklist_template,
      locked: true
    });

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

export async function getOrCreateLayerNodes(depth: number): Promise<Phase2NodeView[]> {
  await requirePhase1Spec();

  const existingNodes = await getNodesByDepth(depth);
  const existingDrafts = await getNodeChecklistDraftsByDepth(depth);

  if (existingNodes.length && existingDrafts.length) {
    return existingNodes.map((node) => ({
      id: node.id,
      intent: node.intent,
      parents: node.parents,
      inputs: node.inputs,
      outputs: node.outputs,
      edges: [],
      checklist: parseChecklist(existingDrafts.find((draft) => draft.node_id === node.id)?.checklist ?? "[]"),
      state: node.state,
      leaf: node.leaf ?? null
    }));
  }

  const proposedNodes = await proposeLayerNodes(depth);
  await approveLayerNodes(depth);

  const nodes = await getNodesByDepth(depth);
  const drafts = await getNodeChecklistDraftsByDepth(depth);

  return nodes.map((node) => ({
    id: node.id,
    intent: node.intent,
    parents: node.parents,
    inputs: node.inputs,
    outputs: node.outputs,
    edges: proposedNodes.find((n) => n.id === node.id)?.edges ?? [],
    checklist: parseChecklist(drafts.find((draft) => draft.node_id === node.id)?.checklist ?? "[]"),
    state: node.state,
    leaf: node.leaf ?? null
  }));
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
    const parentNodes = await getNodesByDepth(depth - 1);
    for (const parentNode of parentNodes) {
      parents.push({
        id: parentNode.id,
        intent: parentNode.intent,
        inputs: parentNode.inputs,
        outputs: parentNode.outputs
      });
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
          existingNodesAtDepth
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
    checklist: node.checklist,
    state: "pending",
    leaf: null
  }));
}

export async function approveLayerNodes(depth: number): Promise<{ approved: true }> {
  const pendingNodes = pendingNodesByDepth.get(depth);

  if (pendingNodes?.length) {
    const edgeDedup = new Set<string>();

    for (const nodeInput of pendingNodes) {
      if (nodeInput.claimed_from) {
        const existing = await getArchNodeById(nodeInput.claimed_from);

        if (!existing) {
          throw new Error(`Claimed node ${nodeInput.claimed_from} not found.`);
        }

        const updatedParents = [...new Set([...existing.parents, ...nodeInput.parents])];
        const updates: {
          parents: string[];
          intent?: string;
          inputs?: string;
          outputs?: string;
        } = { parents: updatedParents };

        if (nodeInput.proposed_edits?.intent) updates.intent = nodeInput.proposed_edits.intent;
        if (nodeInput.proposed_edits?.inputs) updates.inputs = nodeInput.proposed_edits.inputs;
        if (nodeInput.proposed_edits?.outputs) updates.outputs = nodeInput.proposed_edits.outputs;

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

    pendingNodesByDepth.delete(depth);
  }

  const drafts = await getNodeChecklistDraftsByDepth(depth);

  for (const draft of drafts) {
    await updateNodeChecklistDraft(draft.id, { approved: true });
    await emitEvent("node_checklist_approved", "human", { depth, node_id: draft.node_id }, [draft.node_id]);
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

export async function lockLayer(depth: number): Promise<{ locked: true; node_count: number }> {
  const nodes = await getNodesByDepth(depth);

  if (!nodes.length) {
    throw new Error(`No nodes found at depth ${depth}.`);
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
  const nodes = await getNodesByDepth(depth);

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

  return result;
}

export async function confirmLeafNodes(
  depth: number,
  overrides?: Record<string, "leaf" | "decompose_further">
): Promise<LeafDeterminationResponse> {
  const base = pendingLeafByDepth.get(depth);
  if (!base) {
    throw new Error(`No pending leaf determination for depth ${depth}. Call determineLeafNodes first.`);
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

  pendingLeafByDepth.delete(depth);

  return resolved;
}

export async function getExitCheckStatus(): Promise<{ complete: boolean; decompose_further_ids: string[] }> {
  const allNodes: Awaited<ReturnType<typeof getNodesByDepth>> = [];

  for (let depth = 0; depth <= 9; depth += 1) {
    const atDepth = await getNodesByDepth(depth);
    allNodes.push(...atDepth);
  }

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
    .filter((node) => node.state === "locked" && node.leaf === false && !childrenMap.has(node.id))
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

  let node: Awaited<ReturnType<typeof getArchNodeById>> = null;
  for (let depth = 0; depth <= 9; depth += 1) {
    const atDepth = await getNodesByDepth(depth);
    const found = atDepth.find((n) => n.id === nodeId) ?? null;
    if (found) {
      node = found;
      break;
    }
  }

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

export async function confirmDiagnosis(
  nodeId: string,
  override?: Partial<Pick<Prompt7Response, "classification" | "origin_nodes" | "suggested_action">>
): Promise<Prompt7Response> {
  const base = await diagnoseNode(nodeId);

  const resolved: Prompt7Response = {
    classification: override?.classification === "design" || override?.classification === "implementation"
      ? override.classification
      : base.classification,
    reasoning: base.reasoning,
    origin_nodes: Array.isArray(override?.origin_nodes)
      ? override.origin_nodes.filter((id): id is string => typeof id === "string")
      : base.origin_nodes,
    suggested_action:
      typeof override?.suggested_action === "string" ? override.suggested_action : base.suggested_action
  };

  const wasOverridden =
    (override?.classification !== undefined && override.classification !== base.classification) ||
    override?.origin_nodes !== undefined ||
    (override?.suggested_action !== undefined && override.suggested_action !== base.suggested_action);

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

  if (resolved.classification === "design" && resolved.origin_nodes.length > 0) {
    await traverseUpward(resolved.origin_nodes);
  }

  return resolved;
}

export async function traverseUpward(originNodeIds: string[]): Promise<{ invalidated: string[] }> {
  await emitEvent("upward_traversal_triggered", "human", { origin_nodes: originNodeIds }, []);

  const allNodes: Awaited<ReturnType<typeof getNodesByDepth>> = [];

  for (let depth = 0; depth <= 9; depth += 1) {
    const atDepth = await getNodesByDepth(depth);
    allNodes.push(...atDepth);
  }

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

