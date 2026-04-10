export type SessionPhase = "phase1" | "phase2" | "phase3";

export interface SessionRecord {
  id: string;
  current_phase: SessionPhase;
  current_depth: number | null;
  problem_spec_id: string;
  stack_id: string | null;
}

export type SessionCreateInput = SessionRecord;

export type SessionUpdateInput = Partial<Omit<SessionRecord, "id">>;
