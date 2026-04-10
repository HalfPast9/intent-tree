import { connectNeo4j, disconnectNeo4j, ensureSchema, neo4jHealthCheck } from "./db/index.js";
import { ensureDefaultSession } from "./phase2/service.js";
import { createApp } from "./server/app.js";

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap(): Promise<void> {
  await connectNeo4j();
  await ensureSchema();

  const healthy = await neo4jHealthCheck();

  if (!healthy) {
    throw new Error("Neo4j health check failed");
  }

  await ensureDefaultSession();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Intent Tree server running at http://localhost:${PORT}`);
  });
}

bootstrap()
  .catch((error) => {
    console.error("Failed to start Intent Tree foundation", error);
    process.exitCode = 1;
  });

async function shutdown(): Promise<void> {
  await disconnectNeo4j();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
