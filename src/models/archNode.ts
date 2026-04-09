export type ArchNodeState = "pending" | "in_progress" | "locked" | "invalidated";

export interface ArchNode {
  id: string;
  intent: string;
  state: ArchNodeState;
  depth: number;
  parents: string[];
  children: string[];
  edges: string[];
}

export type ArchNodeCreateInput = ArchNode;

export type ArchNodeUpdateInput = Partial<Omit<ArchNode, "id">>;
