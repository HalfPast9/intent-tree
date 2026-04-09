import neo4j, { Integer, RecordShape } from "neo4j-driver";

export function isNeo4jInteger(value: unknown): value is Integer {
  return neo4j.isInt(value);
}

export function toNumber(value: unknown): number {
  if (isNeo4jInteger(value)) {
    return value.toNumber();
  }

  if (typeof value === "number") {
    return value;
  }

  throw new Error("Value is not a Neo4j integer or number.");
}

export function toDateTimeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    return (value as { toString: () => string }).toString();
  }

  throw new Error("Value cannot be converted to a datetime string.");
}

export function getNodeProps<T extends RecordShape>(
  record: T,
  key: string
): Record<string, unknown> {
  const node = record.get(key) as { properties: Record<string, unknown> } | undefined;

  if (!node) {
    throw new Error(`Missing node '${key}' in record.`);
  }

  return node.properties;
}
