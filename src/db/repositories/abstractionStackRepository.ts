import {
  AbstractionStack,
  AbstractionStackCreateInput,
  AbstractionStackUpdateInput
} from "../../models/abstractionStack.js";
import { withSession } from "../client.js";
import { getNodeProps } from "../utils.js";

function mapStack(props: Record<string, unknown>): AbstractionStack {
  return {
    id: String(props.id),
    layers: String(props.layers)
  };
}

export async function createAbstractionStack(
  data: AbstractionStackCreateInput
): Promise<AbstractionStack> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (s:AbstractionStack {
          id: $id,
          layers: $layers
        })
        RETURN s
        `,
        data
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create AbstractionStack ${data.id}`);
    }

    return mapStack(getNodeProps(record, "s"));
  });
}

export async function getAbstractionStackById(id: string): Promise<AbstractionStack | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (s:AbstractionStack {id: $id})
        RETURN s
        `,
        { id }
      )
    );

    const record = result.records[0];
    return record ? mapStack(getNodeProps(record, "s")) : null;
  });
}

export async function updateAbstractionStack(
  id: string,
  fields: AbstractionStackUpdateInput
): Promise<AbstractionStack | null> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (s:AbstractionStack {id: $id})
        SET s += $fields
        RETURN s
        `,
        { id, fields }
      )
    );

    const record = result.records[0];
    return record ? mapStack(getNodeProps(record, "s")) : null;
  });
}
