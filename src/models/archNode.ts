export type ArchNodeState = "pending" | "in_progress" | "locked" | "invalidated";

export interface ArchNode {
  id: string;
  intent: string;
  state: ArchNodeState;
  depth: number;
  parents: string[];
  children: string[];
  edges: string[];
  inputs: string;
  outputs: string;
  leaf?: boolean | null;
}

export type ArchNodeCreateInput = ArchNode;

export type ArchNodeUpdateInput = Partial<Omit<ArchNode, "id">>;
