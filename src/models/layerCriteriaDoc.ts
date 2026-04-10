export interface LayerCriteriaDoc {
  id: string;
  depth: number;
  layer_name: string;
  responsibility_scope: string;
  considerations: string;
  out_of_scope: string;
  checklist_template: string;
  locked: boolean;
}

export type LayerCriteriaDocCreateInput = LayerCriteriaDoc;

export type LayerCriteriaDocUpdateInput = Partial<Omit<LayerCriteriaDoc, "id">>;
