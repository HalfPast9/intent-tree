import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectNeo4j, disconnectNeo4j, withSession } from "../src/db/client";

const APP_NODE_MATCH = `
MATCH (n)
WHERE n:ArchNode OR n:ArchEdge OR n:Event OR n:ProblemSpec
   OR n:AbstractionStack OR n:LayerCriteriaDoc OR n:Session
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

export async function resetDb(): Promise<void> {
  console.warn("WARNING: This will delete all application data. Do not run in production.");

  await connectNeo4j();

  try {
    const total = await withSession("READ", async (session) => {
      const result = await session.run(`${APP_NODE_MATCH} RETURN count(n) AS total`);
      const raw = result.records[0]?.get("total");
      return asNumber(raw ?? 0);
    });

    console.log(`Found ${total} application nodes to delete.`);

    await withSession("WRITE", async (session) => {
      await session.run(`${APP_NODE_MATCH} DETACH DELETE n`);
    });

    console.log(`Deleted ${total} application nodes.`);
  } finally {
    await disconnectNeo4j();
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  resetDb().catch((error) => {
    console.error("Failed to reset database:", error);
    process.exitCode = 1;
  });
}
