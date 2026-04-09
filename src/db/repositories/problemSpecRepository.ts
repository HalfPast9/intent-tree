import {
  ProblemSpec,
  ProblemSpecCreateInput,
  ProblemSpecUpdateInput
} from "../../models/problemSpec.js";
import { withSession } from "../client.js";
import { getNodeProps, toNumber } from "../utils.js";

function mapProblemSpec(props: Record<string, unknown>): ProblemSpec {
  return {
    id: String(props.id),
    problem_statement: String(props.problem_statement),
    hard_constraints: String(props.hard_constraints),
    optimization_targets: String(props.optimization_targets),
    success_criteria: String(props.success_criteria),
    out_of_scope: String(props.out_of_scope),
    assumptions: String(props.assumptions),
    nfrs: String(props.nfrs),
    existing_context: String(props.existing_context),
    locked: Boolean(props.locked)
  };
}

export async function createProblemSpec(data: ProblemSpecCreateInput): Promise<ProblemSpec> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        CREATE (p:ProblemSpec {
          id: $id,
          problem_statement: $problem_statement,
          hard_constraints: $hard_constraints,
          optimization_targets: $optimization_targets,
          success_criteria: $success_criteria,
          out_of_scope: $out_of_scope,
          assumptions: $assumptions,
          nfrs: $nfrs,
          existing_context: $existing_context,
          locked: $locked
        })
        RETURN p
        `,
        data
      )
    );

    const record = result.records[0];

    if (!record) {
      throw new Error(`Failed to create ProblemSpec ${data.id}`);
    }

    return mapProblemSpec(getNodeProps(record, "p"));
  });
}

export async function getProblemSpecById(id: string): Promise<ProblemSpec | null> {
  return withSession("READ", async (session) => {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (p:ProblemSpec {id: $id})
        RETURN p
        `,
        { id }
      )
    );

    const record = result.records[0];
    return record ? mapProblemSpec(getNodeProps(record, "p")) : null;
  });
}

export async function updateProblemSpec(
  id: string,
  fields: ProblemSpecUpdateInput
): Promise<ProblemSpec | null> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (p:ProblemSpec {id: $id})
        SET p += $fields
        RETURN p
        `,
        { id, fields }
      )
    );

    if (result.records.length === 0) {
      return null;
    }

    return getProblemSpecById(id);
  });
}

export async function deleteProblemSpec(id: string): Promise<boolean> {
  return withSession("WRITE", async (session) => {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (p:ProblemSpec {id: $id})
        DETACH DELETE p
        RETURN count(*) AS deletedCount
        `,
        { id }
      )
    );

    const deletedCount = toNumber(result.records[0]?.get("deletedCount") ?? 0);
    return deletedCount > 0;
  });
}
