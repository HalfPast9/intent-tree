import {
  ArchEdge,
  ArchEdgeCreateInput,
  ArchEdgeUpdateInput
} from "../../models/archEdge.js";
import { withSession } from "../client.js";
import { getNodeProps, toNumber } from "../utils.js";

function mapArchEdge(props: Record<string, unknown>): ArchEdge {
  return {
    id: String(props.id),
    source: String(props.source),
    target: String(props.target),
    interface: String(props.interface),
    direction: props.direction === "bidirectional" ? "bidirectional" : "directed"
  };
}

export async function createArchEdge(data: ArchEdgeCreateInput): Promise<ArchEdge> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (e:ArchEdge {
          id: $id,
          source: $source,
          target: $target,
          interface: $interface,
          direction: $direction
        })
        WITH e
        OPTIONAL MATCH (s:ArchNode {id: $source})
        FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END | MERGE (e)-[:CONNECTS]->(s))
        WITH e
        OPTIONAL MATCH (t:ArchNode {id: $target})
        FOREACH (_ IN CASE WHEN t IS NULL THEN [] ELSE [1] END | MERGE (e)-[:CONNECTS]->(t))
        RETURN e
        `,
        {
          id: data.id,
          source: data.source,
          target: data.target,
          interface: data.interface,
          direction: data.direction
        }
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create ArchEdge ${data.id}`);
    }

    return mapArchEdge(getNodeProps(record, "e"));
  });
}

export async function getArchEdgeById(id: string): Promise<ArchEdge | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (e:ArchEdge {id: $id})
        RETURN e
        `,
        { id }
      )
    );

    const record = result.records[0];
    return record ? mapArchEdge(getNodeProps(record, "e")) : null;
  });
}

export async function updateArchEdge(
  id: string,
  fields: ArchEdgeUpdateInput
): Promise<ArchEdge | null> {
  return withSession("WRITE", async (session) => {
    const updatedProps: Record<string, unknown> = {};

    if (fields.source !== undefined) updatedProps.source = fields.source;
    if (fields.target !== undefined) updatedProps.target = fields.target;
    if (fields.interface !== undefined) updatedProps.interface = fields.interface;
    if (fields.direction !== undefined) updatedProps.direction = fields.direction;

    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (e:ArchEdge {id: $id})
        SET e += $updatedProps
        RETURN e
        `,
        { id, updatedProps }
      )
    );

    if (result.records.length === 0) {
      return null;
    }

    if (fields.source !== undefined || fields.target !== undefined) {
      const edge = await getArchEdgeById(id);

      if (!edge) {
        return null;
      }

      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (e:ArchEdge {id: $id})
          OPTIONAL MATCH (e)-[r:CONNECTS]->(:ArchNode)
          DELETE r
          WITH e
          OPTIONAL MATCH (s:ArchNode {id: $source})
          FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END | MERGE (e)-[:CONNECTS]->(s))
          WITH e
          OPTIONAL MATCH (t:ArchNode {id: $target})
          FOREACH (_ IN CASE WHEN t IS NULL THEN [] ELSE [1] END | MERGE (e)-[:CONNECTS]->(t))
          RETURN e
          `,
          { id, source: edge.source, target: edge.target }
        )
      );
    }

    return getArchEdgeById(id);
  });
}

export async function deleteArchEdge(id: string): Promise<boolean> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (e:ArchEdge {id: $id})
        DETACH DELETE e
        RETURN count(*) AS deletedCount
        `,
        { id }
      )
    );

    const deletedCount = toNumber(result.records[0]?.get("deletedCount") ?? 0);
    return deletedCount > 0;
  });
}
