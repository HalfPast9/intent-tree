import { createProblemSpec } from "../src/db/index";
import { connectNeo4j, disconnectNeo4j } from "../src/db/client";
import { resetDb } from "./reset-db";
import { problemSpec } from "./seed-phase1";

async function phase1skip(): Promise<void> {
  console.warn("WARNING: Dev only. Do not run in production.");

  await resetDb();
  await connectNeo4j();

  try {
    await createProblemSpec(problemSpec);

    console.log("Phase1 skip seed complete: unlocked ProblemSpec created.");
  } finally {
    await disconnectNeo4j();
  }
}

phase1skip().catch((error) => {
  console.error("Failed to run phase1skip:", error);
  process.exitCode = 1;
});
