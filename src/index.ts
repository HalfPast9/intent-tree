import { connectNeo4j, disconnectNeo4j, ensureSchema, neo4jHealthCheck } from "./db/index.js";

async function bootstrap(): Promise<void> {
  await connectNeo4j();
  await ensureSchema();

  const healthy = await neo4jHealthCheck();

  if (!healthy) {
    throw new Error("Neo4j health check failed");
  }

  console.log("Intent Tree foundation initialized. Neo4j connection is healthy.");
}

bootstrap()
  .catch((error) => {
    console.error("Failed to start Intent Tree foundation", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectNeo4j();
  });
