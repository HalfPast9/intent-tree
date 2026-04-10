import {
  LayerCriteriaDoc,
  LayerCriteriaDocCreateInput,
  LayerCriteriaDocUpdateInput
} from "../../models/layerCriteriaDoc.js";
import { withSession } from "../client.js";
import { getNodeProps, toNumber } from "../utils.js";

function mapCriteriaDoc(props: Record<string, unknown>): LayerCriteriaDoc {
  return {
    id: String(props.id),
    depth: toNumber(props.depth),
    layer_name: String(props.layer_name),
    responsibility_scope: String(props.responsibility_scope),
    considerations: String(props.considerations),
    out_of_scope: String(props.out_of_scope),
    checklist_template: String(props.checklist_template),
    locked: Boolean(props.locked)
  };
}

export async function createLayerCriteriaDoc(
  data: LayerCriteriaDocCreateInput
): Promise<LayerCriteriaDoc> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (d:LayerCriteriaDoc {
          id: $id,
          depth: $depth,
          layer_name: $layer_name,
          responsibility_scope: $responsibility_scope,
          considerations: $considerations,
          out_of_scope: $out_of_scope,
          checklist_template: $checklist_template,
          locked: $locked
        })
        RETURN d
        `,
        data
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create LayerCriteriaDoc ${data.id}`);
    }

    return mapCriteriaDoc(getNodeProps(record, "d"));
  });
}

export async function getLayerCriteriaDocByDepth(depth: number): Promise<LayerCriteriaDoc | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (d:LayerCriteriaDoc {depth: $depth})
        RETURN d
        ORDER BY d.id DESC
        LIMIT 1
        `,
        { depth }
      )
    );

    const record = result.records[0];
    return record ? mapCriteriaDoc(getNodeProps(record, "d")) : null;
  });
}

export async function updateLayerCriteriaDoc(
  id: string,
  fields: LayerCriteriaDocUpdateInput
): Promise<LayerCriteriaDoc | null> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (d:LayerCriteriaDoc {id: $id})
        SET d += $fields
        RETURN d
        `,
        { id, fields }
      )
    );

    const record = result.records[0];
    return record ? mapCriteriaDoc(getNodeProps(record, "d")) : null;
  });
}
