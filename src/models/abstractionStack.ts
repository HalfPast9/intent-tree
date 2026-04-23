export interface StackLayer {
  layer: string;
  description: string;
  reasoning: string;
}

export interface AbstractionStack {
  id: string;
  layers: string;
}

export type AbstractionStackCreateInput = AbstractionStack;

export type AbstractionStackUpdateInput = Partial<Omit<AbstractionStack, "id">>;
