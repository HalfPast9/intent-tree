import { randomUUID } from "node:crypto";

import {
  createEvent,
  createProblemSpec,
  createSession,
  withSession
} from "../db/index.js";

const APP_NODE_MATCH = `
MATCH (n)
WHERE n:ArchNode OR n:ArchEdge OR n:Event OR n:ProblemSpec
  OR n:AbstractionStack OR n:LayerCriteriaDoc OR n:Session
  OR n:NodeChecklistDraft
`;

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value);
}

export async function resetApplicationData(): Promise<number> {
  const total = await withSession("READ", async (session) => {
    const result = await session.run(`${APP_NODE_MATCH} RETURN count(n) AS total`);
    const raw = result.records[0]?.get("total");
    return asNumber(raw ?? 0);
  });

  await withSession("WRITE", async (session) => {
    await session.run(`${APP_NODE_MATCH} DETACH DELETE n`);
  });

  return total;
}

function eventTimestamp(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export async function seedDefaultPhase1Data(): Promise<void> {
  await resetApplicationData();

  await createProblemSpec({
    id: "spec-url-shortener",
    problem_statement:
      "Build a URL shortening service that converts long URLs into short codes and redirects users to the original URL",
    hard_constraints:
      "Short codes must be globally unique. Redirect latency must be under 50ms at p99. System must handle 10,000 redirects per second.",
    optimization_targets: "Maximize redirect speed. Minimize storage cost per URL.",
    success_criteria: "A short code resolves to the correct URL 100% of the time. Short code generation takes under 200ms.",
    out_of_scope: "User accounts, link expiry, custom slugs, analytics dashboards.",
    assumptions: "Cloud-hosted, stateless application servers. No existing infrastructure to integrate with.",
    nfrs: "99.9% uptime. Horizontal scalability. Sub-50ms p99 redirect latency.",
    existing_context: "None - greenfield project.",
    locked: true
  });

  await createSession({
    id: "session-default",
    current_phase: "phase2",
    current_depth: null,
    problem_spec_id: "spec-url-shortener",
    stack_id: null
  });

  await createEvent({
    id: randomUUID(),
    type: "spec_field_updated",
    timestamp: eventTimestamp(1),
    actor: "human",
    node_ids: ["spec-url-shortener"],
    payload: JSON.stringify({ field: "all", note: "seeded" })
  });

  await createEvent({
    id: randomUUID(),
    type: "conflict_detected",
    timestamp: eventTimestamp(2),
    actor: "llm",
    node_ids: ["spec-url-shortener"],
    payload: JSON.stringify({ conflicts: [] })
  });

  await createEvent({
    id: randomUUID(),
    type: "phase1_locked",
    timestamp: eventTimestamp(3),
    actor: "human",
    node_ids: ["spec-url-shortener"],
    payload: JSON.stringify({})
  });

  await createEvent({
    id: randomUUID(),
    type: "phase_transitioned",
    timestamp: eventTimestamp(4),
    actor: "human",
    node_ids: ["session-default"],
    payload: JSON.stringify({ from: "phase1", to: "phase2" })
  });
}
