export type ArchEdgeDirection = "directed" | "bidirectional";

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  interface: string;
  direction: ArchEdgeDirection;
}

export type ArchEdgeCreateInput = ArchEdge;

export type ArchEdgeUpdateInput = Partial<Omit<ArchEdge, "id">>;
