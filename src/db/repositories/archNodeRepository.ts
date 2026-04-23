import {
  ArchNode,
  ArchNodeCreateInput,
  ArchNodeUpdateInput
} from "../../models/archNode.js";
import { withSession } from "../client.js";
import { getNodeProps, toNumber } from "../utils.js";

function mapArchNode(props: Record<string, unknown>): ArchNode {
  const stateValue = String(props.state);
  const state =
    stateValue === "pending" ||
    stateValue === "in_progress" ||
    stateValue === "locked" ||
    stateValue === "invalidated"
      ? stateValue
      : "pending";

  return {
    id: String(props.id),
    intent: String(props.intent),
    state,
    depth: toNumber(props.depth),
    parents: Array.isArray(props.parents) ? props.parents.map(String) : [],
    children: Array.isArray(props.children) ? props.children.map(String) : [],
    edges: Array.isArray(props.edges) ? props.edges.map(String) : [],
    inputs: String(props.inputs ?? ""),
    outputs: String(props.outputs ?? ""),
    leaf: props.leaf === true ? true : props.leaf === false ? false : null
  };
}

export async function createArchNode(data: ArchNodeCreateInput): Promise<ArchNode> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (n:ArchNode {
          id: $id,
          intent: $intent,
          state: $state,
          depth: $depth,
          parents: $parents,
          children: $children,
          edges: $edges,
          inputs: $inputs,
          outputs: $outputs
        })
        WITH n, $parents AS parentIds, $children AS childIds, $edges AS edgeIds
        CALL {
          WITH n, parentIds
          UNWIND parentIds AS parentId
          MATCH (p:ArchNode {id: parentId})
          MERGE (p)-[:PARENT_OF]->(n)
          RETURN count(*) AS parentLinks
        }
        CALL {
          WITH n, childIds
          UNWIND childIds AS childId
          MATCH (c:ArchNode {id: childId})
          MERGE (n)-[:PARENT_OF]->(c)
          RETURN count(*) AS childLinks
        }
        CALL {
          WITH n, edgeIds
          UNWIND edgeIds AS edgeId
          MATCH (e:ArchEdge {id: edgeId})
          MERGE (e)-[:CONNECTS]->(n)
          RETURN count(*) AS edgeLinks
        }
        RETURN n
        `,
        {
          id: data.id,
          intent: data.intent,
          state: data.state,
          depth: data.depth,
          parents: data.parents,
          children: data.children,
          edges: data.edges,
          inputs: data.inputs,
          outputs: data.outputs
        }
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create ArchNode ${data.id}`);
    }

    return mapArchNode(getNodeProps(record, "n"));
  });
}

export async function getArchNodeById(id: string): Promise<ArchNode | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (n:ArchNode {id: $id})
        RETURN n
        `,
        { id }
      )
    );

    const record = result.records[0];

    return record ? mapArchNode(getNodeProps(record, "n")) : null;
  });
}

export async function updateArchNode(
  id: string,
  fields: ArchNodeUpdateInput
): Promise<ArchNode | null> {
  return withSession("WRITE", async (session) => {
    const updatedProps: Record<string, unknown> = {};

    if (fields.intent !== undefined) updatedProps.intent = fields.intent;
    if (fields.state !== undefined) updatedProps.state = fields.state;
    if (fields.depth !== undefined) updatedProps.depth = fields.depth;
    if (fields.parents !== undefined) updatedProps.parents = fields.parents;
    if (fields.children !== undefined) updatedProps.children = fields.children;
    if (fields.edges !== undefined) updatedProps.edges = fields.edges;
    if (fields.inputs !== undefined) updatedProps.inputs = fields.inputs;
    if (fields.outputs !== undefined) updatedProps.outputs = fields.outputs;
    if (fields.leaf !== undefined) updatedProps.leaf = fields.leaf;

    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (n:ArchNode {id: $id})
        SET n += $updatedProps
        RETURN n
        `,
        { id, updatedProps }
      )
    );

    if (result.records.length === 0) {
      return null;
    }

    if (fields.parents !== undefined) {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (n:ArchNode {id: $id})
          OPTIONAL MATCH (p:ArchNode)-[r:PARENT_OF]->(n)
          DELETE r
          WITH n
          UNWIND $parentIds AS parentId
          MATCH (p:ArchNode {id: parentId})
          MERGE (p)-[:PARENT_OF]->(n)
          RETURN count(*) AS parentLinks
          `,
          { id, parentIds: fields.parents }
        )
      );
    }

    if (fields.children !== undefined) {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (n:ArchNode {id: $id})
          OPTIONAL MATCH (n)-[r:PARENT_OF]->(:ArchNode)
          DELETE r
          WITH n
          UNWIND $childIds AS childId
          MATCH (c:ArchNode {id: childId})
          MERGE (n)-[:PARENT_OF]->(c)
          RETURN count(*) AS childLinks
          `,
          { id, childIds: fields.children }
        )
      );
    }

    if (fields.edges !== undefined) {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (n:ArchNode {id: $id})
          OPTIONAL MATCH (:ArchEdge)-[r:CONNECTS]->(n)
          DELETE r
          WITH n
          UNWIND $edgeIds AS edgeId
          MATCH (e:ArchEdge {id: edgeId})
          MERGE (e)-[:CONNECTS]->(n)
          RETURN count(*) AS edgeLinks
          `,
          { id, edgeIds: fields.edges }
        )
      );
    }

    return getArchNodeById(id);
  });
}

export async function deleteArchNode(id: string): Promise<boolean> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (n:ArchNode {id: $id})
        DETACH DELETE n
        RETURN count(*) AS deletedCount
        `,
        { id }
      )
    );

    const deletedCount = toNumber(result.records[0]?.get("deletedCount") ?? 0);
    return deletedCount > 0;
  });
}

export async function getNodesByDepth(depth: number): Promise<ArchNode[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (n:ArchNode {depth: $depth})
        RETURN n
        ORDER BY n.id ASC
        `,
        { depth }
      )
    );

    return result.records.map((record) => mapArchNode(getNodeProps(record, "n")));
  });
}

export async function getNodeParents(nodeId: string): Promise<ArchNode[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (p:ArchNode)-[:PARENT_OF]->(n:ArchNode {id: $nodeId})
        RETURN DISTINCT p
        ORDER BY p.id ASC
        `,
        { nodeId }
      )
    );

    return result.records.map((record) => mapArchNode(getNodeProps(record, "p")));
  });
}

export async function getNodeSiblings(nodeId: string): Promise<ArchNode[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (n:ArchNode {id: $nodeId})
        MATCH (p:ArchNode)-[:PARENT_OF]->(n)
        MATCH (p)-[:PARENT_OF]->(sibling:ArchNode)
        WHERE sibling.id <> n.id AND sibling.depth = n.depth
        RETURN DISTINCT sibling
        ORDER BY sibling.id ASC
        `,
        { nodeId }
      )
    );

    return result.records.map((record) => mapArchNode(getNodeProps(record, "sibling")));
  });
}

export async function getNodeNeighbours(nodeId: string): Promise<ArchNode[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (n:ArchNode {id: $nodeId})
        MATCH (edge:ArchEdge)-[:CONNECTS]->(n)
        MATCH (edge)-[:CONNECTS]->(neighbour:ArchNode)
        WHERE neighbour.id <> n.id AND neighbour.depth = n.depth
        RETURN DISTINCT neighbour
        ORDER BY neighbour.id ASC
        `,
        { nodeId }
      )
    );

    return result.records.map((record) => mapArchNode(getNodeProps(record, "neighbour")));
  });
}
