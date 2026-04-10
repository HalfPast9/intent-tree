import {
  NodeChecklistDraft,
  NodeChecklistDraftCreateInput,
  NodeChecklistDraftUpdateInput
} from "../../models/nodeChecklistDraft.js";
import { withSession } from "../client.js";
import { getNodeProps, toNumber } from "../utils.js";

function mapDraft(props: Record<string, unknown>): NodeChecklistDraft {
  return {
    id: String(props.id),
    depth: toNumber(props.depth),
    node_id: String(props.node_id),
    checklist: String(props.checklist),
    approved: Boolean(props.approved)
  };
}

export async function createNodeChecklistDraft(
  data: NodeChecklistDraftCreateInput
): Promise<NodeChecklistDraft> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (d:NodeChecklistDraft {
          id: $id,
          depth: $depth,
          node_id: $node_id,
          checklist: $checklist,
          approved: $approved
        })
        RETURN d
        `,
        data
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create NodeChecklistDraft ${data.id}`);
    }

    return mapDraft(getNodeProps(record, "d"));
  });
}

export async function getNodeChecklistDraftsByDepth(depth: number): Promise<NodeChecklistDraft[]> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (d:NodeChecklistDraft {depth: $depth})
        RETURN d
        ORDER BY d.node_id ASC
        `,
        { depth }
      )
    );

    return result.records.map((record) => mapDraft(getNodeProps(record, "d")));
  });
}

export async function updateNodeChecklistDraft(
  id: string,
  fields: NodeChecklistDraftUpdateInput
): Promise<NodeChecklistDraft | null> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (d:NodeChecklistDraft {id: $id})
        SET d += $fields
        RETURN d
        `,
        { id, fields }
      )
    );

    const record = result.records[0];
    return record ? mapDraft(getNodeProps(record, "d")) : null;
  });
}
