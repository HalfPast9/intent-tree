export interface StackLayer {
  layer: string;
  description: string;
  reasoning: string;
}

export interface AbstractionStack {
  id: string;
  layers: string;
  locked: boolean;
}

export type AbstractionStackCreateInput = AbstractionStack;

export type AbstractionStackUpdateInput = Partial<Omit<AbstractionStack, "id">>;
