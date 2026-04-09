export interface ProblemSpec {
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
}

export type ProblemSpecCreateInput = ProblemSpec;

export type ProblemSpecUpdateInput = Partial<Omit<ProblemSpec, "id">>;
