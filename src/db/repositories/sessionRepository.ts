import {
  SessionCreateInput,
  SessionRecord,
  SessionUpdateInput
} from "../../models/session.js";
import { withSession } from "../client.js";
import { getNodeProps, toNumber } from "../utils.js";

function mapSession(props: Record<string, unknown>): SessionRecord {
  return {
    id: String(props.id),
    current_phase: props.current_phase === "phase2" || props.current_phase === "phase3" ? props.current_phase : "phase1",
    current_depth: props.current_depth === null || props.current_depth === undefined ? null : toNumber(props.current_depth),
    problem_spec_id: String(props.problem_spec_id),
    stack_id: props.stack_id === null || props.stack_id === undefined ? null : String(props.stack_id)
  };
}

export async function createSession(data: SessionCreateInput): Promise<SessionRecord> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (s:Session {
          id: $id,
          current_phase: $current_phase,
          current_depth: $current_depth,
          problem_spec_id: $problem_spec_id,
          stack_id: $stack_id
        })
        RETURN s
        `,
        data
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create Session ${data.id}`);
    }

    return mapSession(getNodeProps(record, "s"));
  });
}

export async function getSessionById(id: string): Promise<SessionRecord | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (s:Session {id: $id})
        RETURN s
        `,
        { id }
      )
    );

    const record = result.records[0];
    return record ? mapSession(getNodeProps(record, "s")) : null;
  });
}

export async function getAnySession(): Promise<SessionRecord | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (s:Session)
        RETURN s
        ORDER BY s.id ASC
        LIMIT 1
        `
      )
    );

    const record = result.records[0];
    return record ? mapSession(getNodeProps(record, "s")) : null;
  });
}

export async function updateSession(
  id: string,
  fields: SessionUpdateInput
): Promise<SessionRecord | null> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (s:Session {id: $id})
        SET s += $fields
        RETURN s
        `,
        { id, fields }
      )
    );

    const record = result.records[0];
    return record ? mapSession(getNodeProps(record, "s")) : null;
  });
}
