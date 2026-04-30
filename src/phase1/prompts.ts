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
  userMessage: string,
  currentConflicts: Prompt2Conflict[]
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
    "Current unresolved conflicts (from latest conflict check):",
    JSON.stringify(currentConflicts, null, 2),
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
    "- Values in spec_update must be strings.",
    "",
    "Abstraction level rules (critical):",
    "- The spec captures WHAT the system must do and WHY the constraints exist. It must NOT contain HOW.",
    "- HOW means: specific timeout values, retry counts, buffer sizes, algorithm choices, protocol details, implementation mechanisms. These belong in Phase 2, not here.",
    "- If the user provides implementation detail, abstract it up to a system-level statement. Examples:",
    "  '180ms DB timeout' → 'storage operations must complete within the overall request latency budget'",
    "  '3 retries with exponential backoff' → omit entirely, this is Phase 2",
    "  'use Redis for caching' → 'read path must support low-latency caching'",
    "- Each field should read at the level a CTO would sign off on, not an engineer implementing it.",
    "- When in doubt, keep it shorter and more directional rather than longer and more specific."
  ].join("\n");
}

export function buildPrompt2(spec: ProblemSpec): string {
  return [
    "You are Prompt 2 (Conflict Check) for Intent Tree.",
    "Your task is to identify structural conflicts in the Phase 1 spec that would prevent architecture from starting.",
    "",
    "Scope gate (read carefully before evaluating):",
    "- Only flag a conflict if two reasonable architects, reading this spec, would make FUNDAMENTALLY INCOMPATIBLE structural decisions.",
    "  Example of a real conflict: 'never lose data' + 'avoid replication' — these force contradictory storage architectures.",
    "  Example of NOT a conflict: 'low latency' + 'cost efficiency' — these are tradeoffs, not contradictions. Every system balances them.",
    "- Do NOT flag tensions that are resolvable during architecture (Phase 2 design tradeoffs).",
    "- Do NOT flag tensions introduced by qualifying or clarifying language added to resolve a previous conflict.",
    "- Do NOT flag tensions between specific numbers, thresholds, or implementation-level details.",
    "- A well-scoped Phase 1 spec should have 0–3 genuine structural conflicts. If you find more than 3, the spec is over-specified and the extra tensions are sub-architectural — omit them and return the 1–3 most fundamental ones only.",
    "- Ask yourself: would leaving this tension unresolved prevent an architect from choosing a system shape? If no, it is not a Phase 1 conflict.",
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
