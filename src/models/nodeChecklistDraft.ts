export interface NodeChecklistDraft {
  id: string;
  depth: number;
  node_id: string;
  checklist: string;
  approved: boolean;
}

export type NodeChecklistDraftCreateInput = NodeChecklistDraft;

export type NodeChecklistDraftUpdateInput = Partial<Omit<NodeChecklistDraft, "id">>;
