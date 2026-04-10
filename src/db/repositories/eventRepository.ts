import {
  EventCreateInput,
  EventRecord
} from "../../models/event.js";
import { withSession } from "../client.js";
import { getNodeProps, toDateTimeString } from "../utils.js";

function mapEvent(props: Record<string, unknown>): EventRecord {
  return {
    id: String(props.id),
    type: String(props.type),
    timestamp: toDateTimeString(props.timestamp),
    actor: props.actor === "human" ? "human" : "llm",
    node_ids: Array.isArray(props.node_ids) ? props.node_ids.map(String) : [],
    payload: String(props.payload)
  };
}

export async function createEvent(data: EventCreateInput): Promise<EventRecord> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (ev:Event {
          id: $id,
          type: $type,
          timestamp: datetime($timestamp),
          actor: $actor,
          node_ids: $node_ids,
          payload: $payload
        })
        WITH ev, $node_ids AS nodeIds
        CALL {
          WITH ev, nodeIds
          UNWIND nodeIds AS nodeId
          MATCH (n {id: nodeId})
          WHERE n:ArchNode OR n:ProblemSpec OR n:Session OR n:AbstractionStack OR n:LayerCriteriaDoc OR n:NodeChecklistDraft
          MERGE (ev)-[:AFFECTS]->(n)
          RETURN count(*) AS affectLinks
        }
        WITH ev
        CALL {
          WITH ev
          OPTIONAL MATCH (prev:Event)
          WHERE prev.id <> ev.id
          RETURN prev
          ORDER BY prev.timestamp DESC, prev.id DESC
          LIMIT 1
        }
        FOREACH (_ IN CASE WHEN prev IS NULL THEN [] ELSE [1] END | MERGE (ev)-[:FOLLOWS]->(prev))
        RETURN ev
        `,
        {
          id: data.id,
          type: data.type,
          timestamp: data.timestamp,
          actor: data.actor,
          node_ids: data.node_ids,
          payload: data.payload
        }
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create Event ${data.id}`);
    }

    return mapEvent(getNodeProps(record, "ev"));
  });
}

export async function getEventById(id: string): Promise<EventRecord | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (ev:Event {id: $id})
        RETURN ev
        `,
        { id }
      )
    );

    const record = result.records[0];
    return record ? mapEvent(getNodeProps(record, "ev")) : null;
  });
}

export async function getEventHistory(nodeId: string): Promise<EventRecord[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (ev:Event)-[:AFFECTS]->(n {id: $nodeId})
        WHERE n:ArchNode OR n:ProblemSpec OR n:Session OR n:AbstractionStack OR n:LayerCriteriaDoc OR n:NodeChecklistDraft
        RETURN ev
        ORDER BY ev.timestamp ASC, ev.id ASC
        `,
        { nodeId }
      )
    );

    return result.records.map((record) => mapEvent(getNodeProps(record, "ev")));
  });
}

export async function getFullTimeline(): Promise<EventRecord[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (ev:Event)
        RETURN ev
        ORDER BY ev.timestamp ASC, ev.id ASC
        `
      )
    );

    return result.records.map((record) => mapEvent(getNodeProps(record, "ev")));
  });
}
