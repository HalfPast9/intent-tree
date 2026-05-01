import { LLMMessage } from "../llm/client.js";
import { ProblemSpec } from "../models/problemSpec.js";

export interface StackLayerInput {
  layer: string;
  description: string;
  reasoning: string;
}

export interface Prompt3Response {
  layer_name: string;
  responsibility_scope: string;
  considerations: string;
  out_of_scope: string;
  checklist_template: string[];
}

export interface NodeChecklistItem {
  item: string;
  context: string;
}

export interface ProposedEdgeInput {
  target: string;
  interface: string;
  direction: "directed" | "bidirectional";
}

export interface ProposedNodeInput {
  id: string;
  intent: string;
  parents: string[];
  inputs: string;
  outputs: string;
  edges: ProposedEdgeInput[];
  claimed_from: string | null;
  proposed_edits: { intent?: string; inputs?: string; outputs?: string } | null;
  checklist: NodeChecklistItem[];
}

export interface Prompt4Response {
  nodes: ProposedNodeInput[];
}

export interface Prompt5ValidationResult {
  item: string;
  passed: boolean;
  reasoning: string;
}

export interface Prompt5Response {
  passed: boolean;
  results: Prompt5ValidationResult[];
}

export interface Prompt6CoverageItem {
  parent: string;
  fully_covered: boolean;
  gaps: string[];
  reasoning: string;
}

export interface Prompt6OverlapItem {
  nodes: string[];
  overlap: string;
  reasoning: string;
}

export interface Prompt6Response {
  passed: boolean;
  coverage: Prompt6CoverageItem[];
  overlaps: Prompt6OverlapItem[];
}

export interface Prompt7Response {
  classification: "implementation" | "design";
  reasoning: string;
  origin_nodes: string[];
  suggested_action: string;
}

export interface LeafDetermination {
  node_id: string;
  determination: "leaf" | "decompose_further";
  reasoning: string;
}

export interface LeafDeterminationResponse {
  nodes: LeafDetermination[];
}

function phase1View(spec: ProblemSpec): Record<string, string> {
  return {
    problem_statement: spec.problem_statement,
    hard_constraints: spec.hard_constraints,
    optimization_targets: spec.optimization_targets,
    success_criteria: spec.success_criteria,
    out_of_scope: spec.out_of_scope,
    assumptions: spec.assumptions,
    nfrs: spec.nfrs,
    existing_context: spec.existing_context
  };
}


export function prompt3System(args: {
  layerName: string;
  depth: number;
  totalLayers: number;
  layerDescription: string;
}): string {
  return [
    "You are Prompt 3 (Layer Definition) for Intent Tree. You define what the next layer of abstraction is - its name, scope, considerations, and validation checklist. You do not predict future layers - only define the immediate next one based on what has been built so far.",
    `Current layer: ${args.layerName}`,
    `Current position: depth ${args.depth} of ${args.totalLayers}`,
    `Layer description: ${args.layerDescription}`,
    "Criteria should match this abstraction level: not finer (belongs to deeper layers) and not coarser (belongs to shallower layers).",
    "Return only JSON with shape:",
    "{ layer_name, responsibility_scope, considerations, out_of_scope, checklist_template: string[] }"
  ].join("\n");
}

export function prompt3User(args: {
  spec: ProblemSpec;
  stack: StackLayerInput[];
  depth: number;
  parentIntents: string[];
  parentLayerCriteriaDoc: null | Record<string, unknown>;
  existingNodesAtDepth: Array<{ id: string; intent: string }>;
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    "Stack:",
    JSON.stringify(args.stack, null, 2),
    `Current depth: ${args.depth}`,
    "Parent intents:",
    JSON.stringify(args.parentIntents, null, 2),
    "Parent layer criteria doc:",
    JSON.stringify(args.parentLayerCriteriaDoc, null, 2),
    "Existing nodes at this depth:",
    JSON.stringify(args.existingNodesAtDepth, null, 2)
  ].join("\n");
}

export function prompt4System(args: {
  layerName: string;
  depth: number;
  totalLayers: number;
  layerDescription: string;
}): string {
  return [
    "You are Prompt 4 (Node + Checklist Proposal) for Intent Tree.",
    "You decompose a SINGLE parent into child subsystem nodes at the next layer down.",
    `Current layer: ${args.layerName}`,
    `Layer description: ${args.layerDescription}`,
    "",
    "IMPORTANT: You are decomposing ONE specific parent. All proposed nodes must be children of that parent.",
    "",
    "Each node must include:",
    "- inputs: what this node receives (natural language at upper layers, typed signature at leaf level)",
    "- outputs: what this node produces (natural language at upper layers, typed signature at leaf level)",
    "",
    "SHARED NODE CLAIMING: You will be shown existing nodes at this depth from prior parent decompositions.",
    "If an existing node should also be a child of the current parent:",
    "- Set claimed_from to the existing node's id",
    "- Set proposed_edits to null (claim as-is) or to an object with fields to change",
    "- Keep the same id as the claimed node",
    "If creating a new node, set claimed_from and proposed_edits to null.",
    "",
    "CROSS-PARENT EDGES: You will be shown the current parent's edges to peer parents at the same depth.",
    "These represent connections that MUST be preserved at the child layer.",
    "For each parent-level edge, at least one of your proposed child nodes must have an edge to a child of the connected peer parent.",
    "Target existing nodes from prior decompositions shown in the existing nodes list.",
    "The child-level edge should refine the parent-level interface — be more specific about what data flows between the children.",
    "",
    "Return only JSON with shape:",
    '{ "nodes": [{ "id": "L<depth>-<slug>", "intent": "...", "parents": ["<parent_id>"], "inputs": "...", "outputs": "...", "edges": [{ "target": "<sibling_or_cross_parent_node_id>", "interface": "...", "direction": "directed"|"bidirectional" }], "claimed_from": null, "proposed_edits": null, "checklist": [{ "item": "...", "context": "..." }] }] }'
  ].join("\n");
}

export function prompt4User(args: {
  spec: ProblemSpec;
  stack: StackLayerInput[];
  depth: number;
  parent:
    | { id: string; intent: string; inputs: string; outputs: string }
    | { id: "root"; intent: string };
  layerCriteriaDoc: Prompt3Response;
  existingNodesAtDepth: Array<{ id: string; intent: string; inputs: string; outputs: string; parents: string[] }>;
  parentEdges?: Array<{ peer: string; interface: string; direction: string }>;
}): string {
  const parts = [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    "Stack (layers defined so far):",
    JSON.stringify(args.stack, null, 2),
    `Current depth: ${args.depth}`,
    "",
    "PARENT TO DECOMPOSE:",
    JSON.stringify(args.parent, null, 2),
    "",
    "Layer definition:",
    JSON.stringify(args.layerCriteriaDoc, null, 2),
    "",
    "Existing nodes at this depth (from prior parent decompositions - you may claim these as shared children):",
    args.existingNodesAtDepth.length
      ? JSON.stringify(args.existingNodesAtDepth, null, 2)
      : "None yet."
  ];

  if (args.parentEdges && args.parentEdges.length > 0) {
    parts.push(
      "",
      "PARENT EDGES TO PEER PARENTS (your child nodes must preserve these connections by creating edges to children of the peer):",
      JSON.stringify(args.parentEdges, null, 2)
    );
  }

  return parts.join("\n");
}

export function prompt5System(): string {
  return [
    "You are Prompt 5 (Node Validation) for Intent Tree.",
    "You validate a single node against its checklist. This is a structured comparison task - be precise and unambiguous.",
    "",
    "For EVERY checklist item, you must provide:",
    "- Whether it passed or failed",
    "- Concrete reasoning explaining WHY it passed or failed",
    "",
    "A node passes overall only if ALL checklist items pass.",
    "Include full reasoning on every item - passes AND failures. No shortcuts.",
    "",
    "Return only JSON with shape:",
    '{ "passed": true|false, "results": [{ "item": "checklist item text", "passed": true|false, "reasoning": "why" }] }'
  ].join("\n");
}

export function prompt5User(args: {
  spec: ProblemSpec;
  node: {
    id: string;
    intent: string;
    inputs: string;
    outputs: string;
    edges: Array<{ target: string; interface: string; direction: "directed" | "bidirectional" }>;
  };
  parentNodes: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  siblings: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  neighbours: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  checklist: Array<{ item: string; context: string }>;
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    "NODE TO VALIDATE:",
    JSON.stringify(args.node, null, 2),
    "",
    "Parent nodes:",
    JSON.stringify(args.parentNodes, null, 2),
    "",
    "Sibling nodes (same parent, same depth):",
    JSON.stringify(args.siblings, null, 2),
    "",
    "Edge-connected neighbours (same depth):",
    JSON.stringify(args.neighbours, null, 2),
    "",
    "CHECKLIST TO VALIDATE AGAINST:",
    JSON.stringify(args.checklist, null, 2)
  ].join("\n");
}

export function prompt6System(): string {
  return [
    "You are Prompt 6 (Collective Vertical Check) for Intent Tree.",
    "You evaluate whether the full set of child nodes together fully covers every parent's intent with no gaps and no overlapping responsibilities.",
    "For each parent: list gaps (aspects of parent intent not handled by any child).",
    "Separately list all overlapping responsibilities between sibling pairs.",
    "A layer passes only when every parent is fully covered AND there are no overlaps.",
    "Return only JSON with shape:",
    '{ "passed": true|false, "coverage": [{ "parent": "...", "fully_covered": true|false, "gaps": [...], "reasoning": "..." }], "overlaps": [{ "nodes": [...], "overlap": "...", "reasoning": "..." }] }'
  ].join("\n");
}

export function prompt6User(args: {
  spec: ProblemSpec;
  depth: number;
  parents: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  siblings: Array<{ id: string; intent: string; inputs: string; outputs: string; parents: string[] }>;
  layerCriteriaDoc: Prompt3Response;
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    `Depth: ${args.depth}`,
    "",
    "Parents to check coverage for:",
    JSON.stringify(args.parents, null, 2),
    "",
    "All sibling nodes at this depth:",
    JSON.stringify(args.siblings, null, 2),
    "",
    "Layer definition:",
    JSON.stringify(args.layerCriteriaDoc, null, 2)
  ].join("\n");
}

export function prompt7System(): string {
  return [
    "You are Prompt 7 (Failure Diagnosis) for Intent Tree.",
    "You diagnose why a node failed validation.",
    'Classify as "implementation" (the node\'s own definition is wrong - inputs/outputs/intent can be fixed locally) or "design" (the problem originates in one or more ancestor nodes - the architecture itself needs restructuring).',
    'For implementation errors: origin_nodes must be empty.',
    "For design errors: origin_nodes lists all nodes where the problem originates - trace through parent chains, list every root cause node.",
    "Return only JSON:",
    '{ "classification": "implementation"|"design", "reasoning": "...", "origin_nodes": [...], "suggested_action": "..." }'
  ].join("\n");
}

export function prompt7User(args: {
  spec: ProblemSpec;
  node: { id: string; intent: string; inputs: string; outputs: string };
  failedResults: Array<{ item: string; passed: boolean; reasoning: string }>;
  parentNodes: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  siblings: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  neighbours: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  layerCriteriaDoc: Prompt3Response;
  stack: StackLayerInput[];
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    "FAILED NODE:",
    JSON.stringify(args.node, null, 2),
    "",
    "Failed checklist results:",
    JSON.stringify(args.failedResults, null, 2),
    "",
    "Parent nodes:",
    JSON.stringify(args.parentNodes, null, 2),
    "",
    "Sibling nodes:",
    JSON.stringify(args.siblings, null, 2),
    "",
    "Edge-connected neighbours:",
    JSON.stringify(args.neighbours, null, 2),
    "",
    "Layer definition:",
    JSON.stringify(args.layerCriteriaDoc, null, 2),
    "",
    "Stack:",
    JSON.stringify(args.stack, null, 2)
  ].join("\n");
}

export function promptLeafSystem(): string {
  return [
    "You are the Leaf Determination evaluator for Intent Tree.",
    "For each node, decide: does it contain sub-components that have relationships with each other, or is it a single block of logic (a function)?",
    'Return "leaf" if it is a single indivisible operation.',
    'Return "decompose_further" if it contains multiple parts that interact.',
    "Leaf nodes must eventually have fully typed inputs/outputs - flag in reasoning if a node is leaf but its inputs/outputs are still vague.",
    "Return only JSON:",
    '{ "nodes": [{ "node_id": "...", "determination": "leaf"|"decompose_further", "reasoning": "..." }] }'
  ].join("\n");
}

export function promptLeafUser(args: {
  spec: ProblemSpec;
  depth: number;
  nodes: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    `Depth: ${args.depth}`,
    "",
    "Nodes to classify:",
    JSON.stringify(args.nodes, null, 2)
  ].join("\n");
}

export interface PromptRewriteResponse {
  intent: string;
  inputs: string;
  outputs: string;
}

export function promptRewriteSystem(): string {
  return [
    "You are the Node Rewriter for Intent Tree.",
    "A node failed checklist validation. Rewrite its intent, inputs, and outputs to fix the specific failures.",
    "Rules:",
    "- Fix ONLY the failing items. Every item that currently passes must still pass after your rewrite - the reasoning for each passing item tells you exactly what property of the node satisfies it.",
    "- Stay within the layer's responsibility scope - do not include anything listed in out_of_scope.",
    "- The rewritten node must still serve its parent's intent.",
    "- inputs/outputs must remain at the abstraction level appropriate for this layer.",
    'Return only JSON: { "intent": "...", "inputs": "...", "outputs": "..." }'
  ].join("\n");
}

export function promptRewriteUser(args: {
  spec: ProblemSpec;
  node: { id: string; intent: string; inputs: string; outputs: string };
  parentNodes: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  siblings: Array<{ id: string; intent: string; inputs: string; outputs: string }>;
  failedResults: Array<{ item: string; passed: boolean; reasoning: string }>;
  layerCriteriaDoc: Prompt3Response;
  stack: StackLayerInput[];
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    "FAILED NODE (to rewrite):",
    JSON.stringify(args.node, null, 2),
    "",
    "MUST FIX - these checklist items are currently FAILING. Your rewrite must address each one:",
    JSON.stringify(args.failedResults.filter((r) => !r.passed), null, 2),
    "",
    "MUST PRESERVE - these checklist items are currently PASSING. Your rewrite must continue to satisfy every one of them. The 'reasoning' field explains exactly what property of the current node makes it pass - do not change that property:",
    JSON.stringify(args.failedResults.filter((r) => r.passed), null, 2),
    "",
    "Parent nodes:",
    JSON.stringify(args.parentNodes, null, 2),
    "",
    "Sibling nodes (same parent, same depth):",
    JSON.stringify(args.siblings, null, 2),
    "",
    "Layer definition:",
    JSON.stringify(args.layerCriteriaDoc, null, 2),
    "",
    "Stack:",
    JSON.stringify(args.stack, null, 2)
  ].join("\n");
}

export function buildSimpleMessages(system: string, user: string): LLMMessage[] {
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}
