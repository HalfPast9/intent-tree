import { randomUUID } from "node:crypto";

import { resetDb } from "./reset-db";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const eventRepo = require("../dist/db/repositories/eventRepository.js") as {
  createEvent: (data: {
    id: string;
    type: string;
    timestamp: string;
    actor: "llm" | "human";
    node_ids: string[];
    payload: string;
  }) => Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const problemSpecRepo = require("../dist/db/repositories/problemSpecRepository.js") as {
  createProblemSpec: (data: {
    id: string;
    problem_statement: string;
    hard_constraints: string;
    optimization_targets: string;
    success_criteria: string;
    out_of_scope: string;
    assumptions: string;
    nfrs: string;
    existing_context: string;
    locked: boolean;
  }) => Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sessionRepo = require("../dist/db/repositories/sessionRepository.js") as {
  createSession: (data: {
    id: string;
    current_phase: "phase1" | "phase2" | "phase3";
    current_depth: number | null;
    problem_spec_id: string;
    stack_id: string | null;
  }) => Promise<unknown>;
};

const { createEvent } = eventRepo;
const { createProblemSpec } = problemSpecRepo;
const { createSession } = sessionRepo;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbClient = require("../dist/db/client.js") as {
  connectNeo4j: () => Promise<unknown>;
  disconnectNeo4j: () => Promise<void>;
};

const { connectNeo4j, disconnectNeo4j } = dbClient;

const problemSpec = {
  id: "spec-url-shortener",
  problem_statement: "Build a URL shortening service that converts long URLs into short codes and redirects users to the original URL",
  hard_constraints: "Short codes must be globally unique. Redirect latency must be under 50ms at p99. System must handle 10,000 redirects per second.",
  optimization_targets: "Maximize redirect speed. Minimize storage cost per URL.",
  success_criteria: "A short code resolves to the correct URL 100% of the time. Short code generation takes under 200ms.",
  out_of_scope: "User accounts, link expiry, custom slugs, analytics dashboards.",
  assumptions: "Cloud-hosted, stateless application servers. No existing infrastructure to integrate with.",
  nfrs: "99.9% uptime. Horizontal scalability. Sub-50ms p99 redirect latency.",
  existing_context: "None - greenfield project.",
  locked: true
} as const;

const session = {
  id: "session-default",
  current_phase: "phase2",
  current_depth: null,
  problem_spec_id: "spec-url-shortener",
  stack_id: null
} as const;

function eventTimestamp(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export async function seedPhase1(): Promise<void> {
  console.warn("WARNING: Dev only. Do not run in production.");

  await resetDb();

  await connectNeo4j();

  try {
    await createProblemSpec(problemSpec);
    await createSession(session);

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

    console.log("Seed complete: locked Phase 1 spec and phase2 session created.");
  } finally {
    await disconnectNeo4j();
  }
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  seedPhase1().catch((error) => {
    console.error("Failed to seed Phase 1:", error);
    process.exitCode = 1;
  });
}
