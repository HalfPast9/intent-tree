import neo4j, { Driver, Session } from "neo4j-driver";

import { env } from "../config/env.js";

let driver: Driver | null = null;

export async function connectNeo4j(): Promise<Driver> {
  if (driver) {
    return driver;
  }

  driver = neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD)
  );

  await driver.verifyConnectivity();

  return driver;
}

export function getDriver(): Driver {
  if (!driver) {
    throw new Error("Neo4j driver is not connected. Call connectNeo4j first.");
  }

  return driver;
}

export async function disconnectNeo4j(): Promise<void> {
  if (!driver) {
    return;
  }

  await driver.close();
  driver = null;
}

export async function neo4jHealthCheck(): Promise<boolean> {
  const activeDriver = getDriver();
  const session = activeDriver.session({ defaultAccessMode: "READ" });

  try {
    await session.run("RETURN 1 AS ok");
    return true;
  } finally {
    await session.close();
  }
}

export async function withSession<T>(
  mode: "READ" | "WRITE",
  runner: (session: Session) => Promise<T>
): Promise<T> {
  const activeDriver = getDriver();
  const session = activeDriver.session({ defaultAccessMode: mode });

  try {
    return await runner(session);
  } finally {
    await session.close();
  }
}
