import type { ApiEnvelope, ApiErrorEnvelope } from "@/api/types";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });

  const json = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? "Unknown API error" : json.error);
  }

  return json.data;
}
