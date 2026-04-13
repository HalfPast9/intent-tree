// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbClient = require("../dist/db/client.js") as {
  connectNeo4j: () => Promise<unknown>;
  disconnectNeo4j: () => Promise<void>;
  withSession: <T>(
    mode: "READ" | "WRITE",
    runner: (session: { run: (query: string) => Promise<{ records: Array<{ get: (key: string) => unknown }> }> }) => Promise<T>
  ) => Promise<T>;
};

const { connectNeo4j, disconnectNeo4j, withSession } = dbClient;

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

export async function resetDb(): Promise<void> {
  console.warn("WARNING: This will delete all application data. Do not run in production.");

  await connectNeo4j();

  try {
    const total = await withSession("READ", async (session: { run: (query: string) => Promise<{ records: Array<{ get: (key: string) => unknown }> }> }) => {
      const result = await session.run(`${APP_NODE_MATCH} RETURN count(n) AS total`);
      const raw = result.records[0]?.get("total");
      return asNumber(raw ?? 0);
    });

    console.log(`Found ${total} application nodes to delete.`);

    await withSession("WRITE", async (session: { run: (query: string) => Promise<{ records: Array<{ get: (key: string) => unknown }> }> }) => {
      await session.run(`${APP_NODE_MATCH} DETACH DELETE n`);
    });

    console.log(`Deleted ${total} application nodes.`);
  } finally {
    await disconnectNeo4j();
  }
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  resetDb().catch((error) => {
    console.error("Failed to reset database:", error);
    process.exitCode = 1;
  });
}
