export type EventActor = "llm" | "human";

export interface EventRecord {
  id: string;
  type: string;
  timestamp: string;
  actor: EventActor;
  node_ids: string[];
  payload: string;
}

export type EventCreateInput = EventRecord;
