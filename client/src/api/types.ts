export type ApiEnvelope<T> = {
  ok: true;
  data: T;
  llm_raw: string | null;
};

export type ApiErrorEnvelope = {
  ok: false;
  error: string;
};

export type DisplayState = "pending" | "proposed" | "passed" | "failed" | "locked" | "invalidated";

export type ProblemSpec = {
  id: string;
  problem_statement: string;
  hard_constraints: string;
  optimization_targets: string;
  success_criteria: string;
  out_of_scope: string;
  assumptions: string;
  nfrs: string;
  existing_context: string;
  locked: boolean;
};

export type ConflictItem = {
  fields: string[];
  tension: string;
  question: string;
};

export type ConflictResult = {
  clean: boolean;
  conflicts: ConflictItem[];
};

export type SessionPhase = "phase1" | "phase2" | "phase3";

export type SessionRecord = {
  id: string;
  current_phase: SessionPhase;
  current_depth: number | null;
  problem_spec_id: string;
  stack_id: string | null;
};

export type StackLayer = {
  layer: string;
  description: string;
  reasoning: string;
};

export type AbstractionStack = {
  id: string;
  layers: StackLayer[];
};

export type LayerCriteriaDoc = {
  id: string;
  depth: number;
  layer_name: string;
  responsibility_scope: string;
  considerations: string;
  out_of_scope: string;
  checklist_template: string[];
  locked: boolean;
};

export type NodeEdgeView = {
  id: string;
  target: string;
  interface: string;
  direction: "directed" | "bidirectional";
};

export type NodeView = {
  id: string;
  intent: string;
  parents: string[];
  inputs: string;
  outputs: string;
  leaf: "leaf" | "decompose_further" | null;
  edges: NodeEdgeView[];
  checklist: string[];
  state: "pending" | "in_progress" | "locked" | "invalidated";
};

export type ArchEdge = {
  id: string;
  depth: number;
  source: string;
  target: string;
  interface: string;
  direction: "directed" | "bidirectional";
};

export type EventRecord = {
  id: string;
  type: string;
  timestamp: string;
  actor: string;
  node_ids: string[];
  payload: Record<string, unknown>;
};

export type LayerStatus = {
  depth: number;
  definition_locked: boolean;
  nodes: Array<{ id: string; state: string; intent: string }>;
};

export type ExitCheckResult = {
  complete: boolean;
  decompose_further_ids: string[];
};

export type DiagnosisResult = {
  node_id: string;
  classification: "implementation" | "design";
  reasoning: string;
  origin_nodes: string[];
  suggested_action: string;
};

export type LeafDetermination = {
  node_id: string;
  classification: "leaf" | "decompose_further";
  reasoning: string;
};
