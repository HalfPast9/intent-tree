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
  getLayerCriteriaDocByDepth,
  getNodesByDepth,
  getNodeChecklistDraftsByDepth,
  getProblemSpecById,
  getSessionById,
  getAnySession,
  updateAbstractionStack,
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
  Prompt3Response,
  Prompt4Response,
  Prompt5Response,
  Prompt6Response,
  StackLayerInput
} from "./prompts.js";

const SESSION_ID = "default-session";
const PHASE1_SPEC_ID = "spec-url-shortener";

export interface StackEvolutionProposal {
  depth: number;
  proposed_stack: StackLayerInput[];
  reasoning: string;
}

const pendingStackEvolutionByDepth = new Map<number, StackEvolutionProposal>();
const pendingStackProposal: { layers: StackLayerInput[] | null } = { layers: null };
const pendingCriteriaByDepth = new Map<number, Prompt5Response>();
const pendingNodesByDepth = new Map<number, Prompt6Response["nodes"]>();

export interface Phase2NodeView {
  id: string;
  intent: string;
  parents: string[];
  edges: Array<{ target: string; interface: string; direction: "directed" | "bidirectional" }>;
  checklist: Array<{ item: string; context: string }>;
  state: string;
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

function validatePrompt3(raw: Record<string, unknown>): Prompt3Response {
  const stack = Array.isArray(raw.stack) ? raw.stack : [];

  const normalized = stack
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

  if (!normalized.length) {
    throw new Error("Prompt 3 returned an empty or invalid stack.");
  }

  return { stack: normalized };
}

function validatePrompt4(raw: Record<string, unknown>): Prompt4Response {
  const changeNeeded = Boolean(raw.change_needed);
  const proposedRaw = Array.isArray(raw.proposed_stack) ? raw.proposed_stack : [];

  const proposed = proposedRaw
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

  return {
    change_needed: changeNeeded,
    proposed_stack: proposed,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : ""
  };
}

function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  return String(value ?? "");
}

function validatePrompt5(raw: Record<string, unknown>): Prompt5Response {
  const checklistRaw = Array.isArray(raw.checklist_template) ? raw.checklist_template : [];
  const checklist = checklistRaw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  const doc: Prompt5Response = {
    layer_name: typeof raw.layer_name === "string" ? raw.layer_name : "",
    responsibility_scope: typeof raw.responsibility_scope === "string" ? raw.responsibility_scope : "",
    considerations: coerceToString(raw.considerations),
    out_of_scope: coerceToString(raw.out_of_scope),
    checklist_template: checklist
  };

  if (!doc.layer_name || !doc.responsibility_scope || !doc.considerations || !doc.out_of_scope) {
    throw new Error("Prompt 5 returned invalid criteria doc fields.");
  }

  return doc;
}

function validatePrompt6(raw: Record<string, unknown>): Prompt6Response {
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

      return { id, intent, parents, edges, checklist };
    })
    .filter((node): node is Prompt6Response["nodes"][number] => node !== null);

  if (!nodes.length) {
    throw new Error("Prompt 6 returned no valid nodes.");
  }

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

async function requireApprovedStack(session: SessionRecord): Promise<AbstractionStack> {
  if (!session.stack_id) {
    throw new Error("Stack must be approved before this step.");
  }

  const stack = await getAbstractionStackById(session.stack_id);

  if (!stack) {
    throw new Error("Approved stack is missing.");
  }

  return stack;
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

export async function getOrCreateProposedStack(): Promise<{
  stack: AbstractionStack;
  layers: StackLayerInput[];
  session: SessionRecord;
}> {
  await requirePhase1Spec();
  let session = await getCurrentSession();

  if (session.current_phase !== "phase2" || session.current_depth === null) {
    const transitioned = await transitionSessionToPhase2();
    session = transitioned;
  }

  if (session.stack_id) {
    const existingStack = await getAbstractionStackById(session.stack_id);

    if (existingStack) {
      return {
        stack: existingStack,
        layers: parseStackLayers(existingStack),
        session
      };
    }
  }

  const spec = await requirePhase1Spec();
  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(prompt3System(), prompt3User(spec))
  );
  const parsed = validatePrompt3(raw);

  const stack = await createAbstractionStack({
    id: `stack-${randomUUID()}`,
    layers: JSON.stringify(parsed.stack),
    locked: false
  });

  const updatedSession = await updateSession(session.id, {
    stack_id: stack.id,
    current_phase: "phase2",
    current_depth: 0
  });

  if (!updatedSession) {
    throw new Error("Failed to attach stack to session.");
  }

  await emitEvent("stack_proposed", "llm", { stack: parsed.stack }, [stack.id]);

  return { stack, layers: parsed.stack, session: updatedSession };
}

export async function proposeStack(): Promise<{ layers: StackLayerInput[]; session: SessionRecord }> {
  await requirePhase1Spec();
  let session = await getCurrentSession();

  if (session.current_phase !== "phase2" || session.current_depth === null) {
    session = await transitionSessionToPhase2();
  }

  const spec = await requirePhase1Spec();
  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(prompt3System(), prompt3User(spec))
  );
  const parsed = validatePrompt3(raw);

  pendingStackProposal.layers = parsed.stack;

  return { layers: parsed.stack, session };
}

export async function approveStack(input?: { layers?: StackLayerInput[] }): Promise<{
  stack: AbstractionStack;
  layers: StackLayerInput[];
}> {
  if (pendingStackProposal.layers) {
    await requirePhase1Spec();
    let session = await getCurrentSession();

    if (session.current_phase !== "phase2" || session.current_depth === null) {
      session = await transitionSessionToPhase2();
    }

    const proposedLayers = pendingStackProposal.layers;
    const editedLayers = input?.layers && input.layers.length ? input.layers : proposedLayers;
    const wasEdited = JSON.stringify(proposedLayers) !== JSON.stringify(editedLayers);

    const stack = await createAbstractionStack({
      id: `stack-${randomUUID()}`,
      layers: JSON.stringify(editedLayers),
      locked: true
    });

    const updatedSession = await updateSession(session.id, {
      stack_id: stack.id,
      current_phase: "phase2",
      current_depth: 0
    });

    if (!updatedSession) {
      throw new Error("Failed to attach stack to session.");
    }

    await emitEvent("stack_proposed", "llm", { stack: proposedLayers }, [stack.id]);

    if (wasEdited) {
      await emitEvent("stack_edited", "human", { stack: editedLayers }, [stack.id]);
    }

    await emitEvent("stack_approved", "human", { stack: editedLayers }, [stack.id]);
    pendingStackProposal.layers = null;

    return { stack, layers: editedLayers };
  }

  const { stack } = await getOrCreateProposedStack();

  const existingLayers = parseStackLayers(stack);
  const editedLayers = input?.layers && input.layers.length ? input.layers : existingLayers;

  const wasEdited = JSON.stringify(existingLayers) !== JSON.stringify(editedLayers);

  const updated = await updateAbstractionStack(stack.id, {
    layers: JSON.stringify(editedLayers),
    locked: true
  });

  if (!updated) {
    throw new Error("Failed to approve abstraction stack.");
  }

  if (wasEdited) {
    await emitEvent("stack_edited", "human", { stack: editedLayers }, [updated.id]);
  }

  await emitEvent("stack_approved", "human", { stack: editedLayers }, [updated.id]);

  return { stack: updated, layers: editedLayers };
}

async function runStackEvolutionCheck(depth: number): Promise<Prompt4Response> {
  const spec = await requirePhase1Spec();
  const session = await getCurrentSession();
  const stack = await requireApprovedStack(session);
  const layers = parseStackLayers(stack);

  const lockedLayerSummary: Array<{ depth: number; node_ids: string[] }> = [];

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt4System(),
      prompt4User({
        spec,
        currentStack: layers,
        currentDepth: depth,
        lockedLayerSummary
      })
    )
  );

  const parsed = validatePrompt4(raw);

  if (!parsed.change_needed) {
    pendingStackEvolutionByDepth.delete(depth);
    await emitEvent("stack_check_passed", "llm", { depth }, [stack.id]);
    return parsed;
  }

  pendingStackEvolutionByDepth.set(depth, {
    depth,
    proposed_stack: parsed.proposed_stack,
    reasoning: parsed.reasoning
  });

  return parsed;
}

function getCurrentLayerMeta(stackLayers: StackLayerInput[], depth: number): {
  layerName: string;
  layerDescription: string;
  totalLayers: number;
} {
  const totalLayers = stackLayers.length || 1;
  const current = stackLayers[depth] ?? stackLayers[stackLayers.length - 1] ?? {
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

export async function getStackEvolutionProposal(depth: number): Promise<StackEvolutionProposal | null> {
  const existing = pendingStackEvolutionByDepth.get(depth);

  if (existing) {
    return existing;
  }

  const result = await runStackEvolutionCheck(depth);

  if (!result.change_needed) {
    return null;
  }

  return pendingStackEvolutionByDepth.get(depth) ?? null;
}

export async function approveStackEvolution(input: {
  depth: number;
  proposed_stack?: StackLayerInput[];
}): Promise<{ stack: AbstractionStack; layers: StackLayerInput[] }> {
  const { stack } = await getOrCreateProposedStack();
  const pending = pendingStackEvolutionByDepth.get(input.depth);

  if (!pending) {
    throw new Error("No pending stack evolution proposal for this depth.");
  }

  const nextLayers = input.proposed_stack?.length ? input.proposed_stack : pending.proposed_stack;

  const updated = await updateAbstractionStack(stack.id, {
    layers: JSON.stringify(nextLayers)
  });

  if (!updated) {
    throw new Error("Failed to persist approved stack evolution.");
  }

  pendingStackEvolutionByDepth.delete(input.depth);

  await emitEvent(
    "stack_evolved",
    "human",
    {
      depth: input.depth,
      proposed_stack: nextLayers,
      reasoning: pending.reasoning
    },
    [updated.id]
  );

  return {
    stack: updated,
    layers: parseStackLayers(updated)
  };
}

export async function getOrCreateLayerCriteria(depth: number): Promise<LayerCriteriaDoc> {
  await requirePhase1Spec();
  const existing = await getLayerCriteriaDocByDepth(depth);

  if (existing) {
    return existing;
  }

  await getStackEvolutionProposal(depth);

  if (pendingStackEvolutionByDepth.has(depth)) {
    throw new Error("Stack evolution approval is required before generating criteria for this depth.");
  }

  const spec = await requirePhase1Spec();
  const { stack } = await getOrCreateProposedStack();
  const layers = parseStackLayers(stack);
  const parentIntents = await getParentIntents(spec, depth);
  const parentLayerCriteriaDoc = await getParentLayerCriteriaDocContext(depth);
  const layerMeta = getCurrentLayerMeta(layers, depth);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt5System({
        layerName: layerMeta.layerName,
        depth,
        totalLayers: layerMeta.totalLayers,
        layerDescription: layerMeta.layerDescription
      }),
      prompt5User({
        spec,
        stack: layers,
        depth,
        parentIntents,
        parentLayerCriteriaDoc,
        existingNodesAtDepth: []
      })
    )
  );

  const parsed = validatePrompt5(raw);

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
    "criteria_doc_generated",
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

export async function generateLayerCriteria(depth: number): Promise<LayerCriteriaDoc> {
  await requirePhase1Spec();

  await getStackEvolutionProposal(depth);

  if (pendingStackEvolutionByDepth.has(depth)) {
    throw new Error("Stack evolution approval is required before generating criteria for this depth.");
  }

  const spec = await requirePhase1Spec();
  const session = await getCurrentSession();
  const stack = await requireApprovedStack(session);
  const layers = parseStackLayers(stack);
  const parentIntents = await getParentIntents(spec, depth);
  const parentLayerCriteriaDoc = await getParentLayerCriteriaDocContext(depth);
  const layerMeta = getCurrentLayerMeta(layers, depth);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt5System({
        layerName: layerMeta.layerName,
        depth,
        totalLayers: layerMeta.totalLayers,
        layerDescription: layerMeta.layerDescription
      }),
      prompt5User({
        spec,
        stack: layers,
        depth,
        parentIntents,
        parentLayerCriteriaDoc,
        existingNodesAtDepth: []
      })
    )
  );

  const parsed = validatePrompt5(raw);
  pendingCriteriaByDepth.set(depth, parsed);

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

export async function approveLayerCriteria(
  depth: number,
  edits?: Partial<Omit<LayerCriteriaDoc, "id" | "depth">>
): Promise<LayerCriteriaDoc> {
  const pending = pendingCriteriaByDepth.get(depth);

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
      "criteria_doc_generated",
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
      await emitEvent("criteria_doc_edited", "human", { depth }, [created.id]);
    }

    await emitEvent("criteria_doc_approved", "human", { depth }, [created.id]);
    pendingCriteriaByDepth.delete(depth);
    return created;
  }

  const current = await getLayerCriteriaDocByDepth(depth);

  if (!current) {
    throw new Error("No criteria proposal available. Generate criteria before approval.");
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
    throw new Error("Failed to approve criteria doc.");
  }

  if (edited) {
    await emitEvent("criteria_doc_edited", "human", { depth }, [updated.id]);
  }

  await emitEvent("criteria_doc_approved", "human", { depth }, [updated.id]);

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
      edges: [],
      checklist: parseChecklist(existingDrafts.find((draft) => draft.node_id === node.id)?.checklist ?? "[]"),
      state: node.state
    }));
  }

  const spec = await requirePhase1Spec();
  const { stack } = await getOrCreateProposedStack();
  const layers = parseStackLayers(stack);
  const criteria = await getOrCreateLayerCriteria(depth);
  const parentIntents = await getParentIntents(spec, depth);
  const layerMeta = getCurrentLayerMeta(layers, depth);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt6System({
        layerName: layerMeta.layerName,
        depth,
        totalLayers: layerMeta.totalLayers,
        layerDescription: layerMeta.layerDescription
      }),
      prompt6User({
        spec,
        stack: layers,
        depth,
        parentIntents,
        layerCriteriaDoc: {
          layer_name: criteria.layer_name,
          responsibility_scope: criteria.responsibility_scope,
          considerations: criteria.considerations,
          out_of_scope: criteria.out_of_scope,
          checklist_template: JSON.parse(criteria.checklist_template)
        },
        existingNodesAtDepth: []
      })
    )
  );

  const parsed = validatePrompt6(raw);

  // TODO(10.7): Shared-node proposal/claim flow for multi-parent nodes is unresolved in spec section 10.7.
  const edgeDedup = new Set<string>();

  for (const nodeInput of parsed.nodes) {
    await createArchNode({
      id: nodeInput.id,
      intent: nodeInput.intent,
      state: "pending",
      depth,
      parents: nodeInput.parents,
      children: [],
      edges: []
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

  const nodes = await getNodesByDepth(depth);
  const drafts = await getNodeChecklistDraftsByDepth(depth);

  return nodes.map((node) => ({
    id: node.id,
    intent: node.intent,
    parents: node.parents,
    edges: parsed.nodes.find((n) => n.id === node.id)?.edges ?? [],
    checklist: parseChecklist(drafts.find((draft) => draft.node_id === node.id)?.checklist ?? "[]"),
    state: node.state
  }));
}

export async function proposeLayerNodes(depth: number): Promise<Phase2NodeView[]> {
  await requirePhase1Spec();

  const spec = await requirePhase1Spec();
  const session = await getCurrentSession();
  const stack = await requireApprovedStack(session);
  const layers = parseStackLayers(stack);
  const criteria = await getLayerCriteriaDocByDepth(depth);

  if (!criteria || !criteria.locked) {
    throw new Error("Criteria doc must be approved before proposing nodes.");
  }
  const parentIntents = await getParentIntents(spec, depth);
  const layerMeta = getCurrentLayerMeta(layers, depth);

  const raw = await callLLMWithMessages<Record<string, unknown>>(
    buildSimpleMessages(
      prompt6System({
        layerName: layerMeta.layerName,
        depth,
        totalLayers: layerMeta.totalLayers,
        layerDescription: layerMeta.layerDescription
      }),
      prompt6User({
        spec,
        stack: layers,
        depth,
        parentIntents,
        layerCriteriaDoc: {
          layer_name: criteria.layer_name,
          responsibility_scope: criteria.responsibility_scope,
          considerations: criteria.considerations,
          out_of_scope: criteria.out_of_scope,
          checklist_template: JSON.parse(criteria.checklist_template)
        },
        existingNodesAtDepth: []
      })
    )
  );

  const parsed = validatePrompt6(raw);
  pendingNodesByDepth.set(depth, parsed.nodes);

  return parsed.nodes.map((node) => ({
    id: node.id,
    intent: node.intent,
    parents: node.parents,
    edges: node.edges,
    checklist: node.checklist,
    state: "pending"
  }));
}

export async function approveLayerNodes(depth: number): Promise<{ approved: true }> {
  const pendingNodes = pendingNodesByDepth.get(depth);

  if (pendingNodes?.length) {
    // TODO(10.7): Shared-node proposal/claim flow for multi-parent nodes is unresolved in spec section 10.7.
    const edgeDedup = new Set<string>();

    for (const nodeInput of pendingNodes) {
      await createArchNode({
        id: nodeInput.id,
        intent: nodeInput.intent,
        state: "pending",
        depth,
        parents: nodeInput.parents,
        children: [],
        edges: []
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

export async function getPhase2Snapshot(depth: number): Promise<{
  session: SessionRecord;
  stack: { id: string; locked: boolean; layers: StackLayerInput[] } | null;
  stack_evolution_proposal: StackEvolutionProposal | null;
  criteria: LayerCriteriaDoc | null;
  nodes: Phase2NodeView[];
}> {
  const session = await getCurrentSession();
  let stackView: { id: string; locked: boolean; layers: StackLayerInput[] } | null = null;

  if (session.stack_id) {
    const stack = await getAbstractionStackById(session.stack_id);

    if (stack) {
      stackView = {
        id: stack.id,
        locked: stack.locked,
        layers: parseStackLayers(stack)
      };
    }
  }

  const stackEvolutionProposal = await getStackEvolutionProposal(depth);

  let criteria: LayerCriteriaDoc | null = null;
  let nodes: Phase2NodeView[] = [];

  if (!stackEvolutionProposal) {
    criteria = await getLayerCriteriaDocByDepth(depth);
    nodes = await getOrCreateLayerNodes(depth);
  }

  return {
    session,
    stack: stackView,
    stack_evolution_proposal: stackEvolutionProposal,
    criteria,
    nodes
  };
}
