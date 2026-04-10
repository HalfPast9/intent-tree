import { ProblemSpec } from "../models/problemSpec.js";

export type Phase1SpecField =
  | "problem_statement"
  | "hard_constraints"
  | "optimization_targets"
  | "success_criteria"
  | "out_of_scope"
  | "assumptions"
  | "nfrs"
  | "existing_context";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const PHASE1_FIELDS: Phase1SpecField[] = [
  "problem_statement",
  "hard_constraints",
  "optimization_targets",
  "success_criteria",
  "out_of_scope",
  "assumptions",
  "nfrs",
  "existing_context"
];

export const PHASE1_FIELD_DESCRIPTIONS: Record<Phase1SpecField, string> = {
  problem_statement: "What are we solving",
  hard_constraints: "Non-negotiables — things the solution cannot violate",
  optimization_targets: "What to maximize or minimize (directional, not thresholds)",
  success_criteria: "How do we know the solution worked",
  out_of_scope: "What we are explicitly not solving",
  assumptions: "Assumptions shaping the solution space",
  nfrs: "Hard non-functional thresholds (performance, reliability, security, etc.)",
  existing_context: "Current stack, fixed systems, and known integrations"
};

export interface Prompt1Response {
  message: string;
  spec_update: Partial<Record<Phase1SpecField, string>>;
}

export interface Prompt2Conflict {
  fields: Phase1SpecField[];
  tension: string;
  question: string;
}

export interface Prompt2Response {
  clean: boolean;
  conflicts: Prompt2Conflict[];
}

export function getEmptyFields(spec: ProblemSpec): Phase1SpecField[] {
  return PHASE1_FIELDS.filter((field) => !String(spec[field]).trim());
}

export function isPhase1SpecComplete(spec: ProblemSpec): boolean {
  return getEmptyFields(spec).length === 0;
}

export function buildPrompt1(
  spec: ProblemSpec,
  userMessage: string
): string {
  const emptyFields = getEmptyFields(spec);

  return [
    "Current spec state:",
    JSON.stringify(
      {
        problem_statement: spec.problem_statement,
        hard_constraints: spec.hard_constraints,
        optimization_targets: spec.optimization_targets,
        success_criteria: spec.success_criteria,
        out_of_scope: spec.out_of_scope,
        assumptions: spec.assumptions,
        nfrs: spec.nfrs,
        existing_context: spec.existing_context
      },
      null,
      2
    ),
    "",
    "Currently empty fields:",
    JSON.stringify(emptyFields, null, 2),
    "",
    "Latest user message:",
    userMessage
  ].join("\n");
}

export function buildPrompt1SystemPrompt(): string {
  return [
    "You are Prompt 1 (Problem Space Elicitation) for Intent Tree.",
    "Role: collaborative problem-space elicitation partner.",
    "Tone: natural and adaptive to the user, never a rigid interview.",
    "Ask focused follow-up questions when useful.",
    "",
    "Required schema fields and descriptions:",
    JSON.stringify(PHASE1_FIELD_DESCRIPTIONS, null, 2),
    "",
    "Return ONLY JSON with this exact schema:",
    JSON.stringify(
      {
        message: "conversational reply shown to user",
        spec_update: {
          problem_statement: "optional string update"
        }
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- spec_update may update one or multiple schema fields in one turn.",
    "- If no field changed this turn, return spec_update as {}.",
    "- Only include keys from the schema field list.",
    "- Values in spec_update must be strings."
  ].join("\n");
}

export function buildPrompt2(spec: ProblemSpec): string {
  return [
    "You are Prompt 2 (Conflict Check) for Intent Tree.",
    "Your task is to detect tensions/conflicts in the completed Phase 1 spec.",
    "Prioritize conflicts between hard_constraints, optimization_targets, and nfrs.",
    "Also verify problem_statement and success_criteria are aligned and achievable under constraints.",
    "",
    "Complete spec:",
    JSON.stringify(
      {
        problem_statement: spec.problem_statement,
        hard_constraints: spec.hard_constraints,
        optimization_targets: spec.optimization_targets,
        success_criteria: spec.success_criteria,
        out_of_scope: spec.out_of_scope,
        assumptions: spec.assumptions,
        nfrs: spec.nfrs,
        existing_context: spec.existing_context
      },
      null,
      2
    ),
    "",
    "Return ONLY JSON with this shape:",
    JSON.stringify(
      {
        clean: true,
        conflicts: [
          {
            fields: ["hard_constraints", "nfrs"],
            tension: "description",
            question: "clarifying question"
          }
        ]
      },
      null,
      2
    )
  ].join("\n");
}
