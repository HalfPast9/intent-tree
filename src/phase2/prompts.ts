import { LLMMessage } from "../llm/client.js";
import { ProblemSpec } from "../models/problemSpec.js";

export interface StackLayerInput {
  layer: string;
  description: string;
  reasoning: string;
}

export interface Prompt3Response {
  stack: StackLayerInput[];
}

export interface Prompt4Response {
  change_needed: boolean;
  proposed_stack: StackLayerInput[];
  reasoning: string;
}

export interface Prompt5Response {
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
  edges: ProposedEdgeInput[];
  checklist: NodeChecklistItem[];
}

export interface Prompt6Response {
  nodes: ProposedNodeInput[];
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

export function prompt3System(): string {
  return [
    "You are Prompt 3 (Abstraction Stack Proposal) for Intent Tree.",
    "Return only JSON with shape: { stack: [{ layer, description, reasoning }] }.",
    "Design a problem-appropriate abstraction stack from high-level to low-level.",
    "Each item must be concise and meaningful."
  ].join("\n");
}

export function prompt3User(spec: ProblemSpec): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(spec), null, 2)
  ].join("\n");
}

export function prompt4System(): string {
  return [
    "You are Prompt 4 (Stack Evolution Check) for Intent Tree.",
    "Return only JSON with shape: { change_needed: boolean, proposed_stack: [{ layer, description, reasoning }], reasoning: string }.",
    "If no change is needed, return change_needed=false, proposed_stack=[], reasoning=''"
  ].join("\n");
}

export function prompt4User(args: {
  spec: ProblemSpec;
  currentStack: StackLayerInput[];
  currentDepth: number;
  lockedLayerSummary: Array<{ depth: number; node_ids: string[] }>;
}): string {
  return [
    "Phase 1 spec:",
    JSON.stringify(phase1View(args.spec), null, 2),
    "",
    "Current abstraction stack:",
    JSON.stringify(args.currentStack, null, 2),
    "",
    `Current depth: ${args.currentDepth}`,
    "",
    "Locked layer summary:",
    JSON.stringify(args.lockedLayerSummary, null, 2)
  ].join("\n");
}

export function prompt5System(args: {
  layerName: string;
  depth: number;
  totalLayers: number;
  layerDescription: string;
}): string {
  return [
    "You are Prompt 5 (Layer Criteria Doc Generation) for Intent Tree.",
    `Current layer: ${args.layerName}`,
    `Current position: depth ${args.depth} of ${args.totalLayers}`,
    `Layer description: ${args.layerDescription}`,
    "Criteria should match this abstraction level: not finer (belongs to deeper layers) and not coarser (belongs to shallower layers).",
    "Return only JSON with shape:",
    "{ layer_name, responsibility_scope, considerations, out_of_scope, checklist_template: string[] }"
  ].join("\n");
}

export function prompt5User(args: {
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

export function prompt6System(args: {
  layerName: string;
  depth: number;
  totalLayers: number;
  layerDescription: string;
}): string {
  return [
    "You are Prompt 6 (Node + Checklist Proposal) for Intent Tree.",
    `Current layer: ${args.layerName}`,
    `Current position: depth ${args.depth} of ${args.totalLayers}`,
    `Layer description: ${args.layerDescription}`,
    "Node proposals must match this abstraction level: not finer (belongs to deeper layers) and not coarser (belongs to shallower layers).",
    "Return only JSON with shape:",
    "{ nodes: [{ id, intent, parents: string[], edges: [{ target, interface, direction }], checklist: [{ item, context }] }] }",
    "IDs should follow depth+slug format like L0-frontend."
  ].join("\n");
}

export function prompt6User(args: {
  spec: ProblemSpec;
  stack: StackLayerInput[];
  depth: number;
  parentIntents: string[];
  layerCriteriaDoc: Prompt5Response;
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
    "Layer criteria doc:",
    JSON.stringify(args.layerCriteriaDoc, null, 2),
    "Existing nodes at this depth:",
    JSON.stringify(args.existingNodesAtDepth, null, 2)
  ].join("\n");
}

export function buildSimpleMessages(system: string, user: string): LLMMessage[] {
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}
