import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  NEO4J_URI: requireEnv("NEO4J_URI"),
  NEO4J_USERNAME: requireEnv("NEO4J_USERNAME"),
  NEO4J_PASSWORD: requireEnv("NEO4J_PASSWORD"),
  AZURE_KIMI_API_KEY: requireEnv("AZURE_KIMI_API_KEY")
};
