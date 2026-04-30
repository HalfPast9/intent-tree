import OpenAI from "openai";

import { env } from "../config/env.js";

export class LLMResponseParseError extends Error {
  public readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = "LLMResponseParseError";
    this.raw = raw;
  }
}

export interface CallLLMOptions {
  systemPrompt?: string;
  temperature?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const client = new OpenAI({
  apiKey: env.AZURE_KIMI_API_KEY,
  baseURL: `${env.AZURE_KIMI_ENDPOINT.replace(/\/$/, "")}/models`,
  defaultQuery: { "api-version": "2024-05-01-preview" }
});

const rawResponseLog: string[] = [];

function recordRawResponse(raw: string): void {
  rawResponseLog.push(raw);

  if (rawResponseLog.length > 200) {
    rawResponseLog.splice(0, rawResponseLog.length - 200);
  }
}

export function getLLMRawLogLength(): number {
  return rawResponseLog.length;
}

export function getLLMRawSince(index: number): string[] {
  if (index < 0 || index >= rawResponseLog.length) {
    return index < 0 ? [...rawResponseLog] : [];
  }

  return rawResponseLog.slice(index);
}

function extractTextContent(content: OpenAI.Chat.Completions.ChatCompletionMessageParam["content"] | OpenAI.Chat.Completions.ChatCompletion["choices"][number]["message"]["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (typeof part === "object" && part !== null && "type" in part && part.type === "text") {
        return "text" in part ? String(part.text) : "";
      }

      return "";
    })
    .join("\n")
    .trim();
}

export async function callLLM<T extends Record<string, unknown>>(
  prompt: string,
  options: CallLLMOptions = {}
): Promise<T> {
  const messages: LLMMessage[] = [
    ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt } as const] : []),
    { role: "user", content: prompt }
  ];

  return callLLMWithMessages<T>(messages, { temperature: options.temperature });
}

export async function callLLMWithMessages<T extends Record<string, unknown>>(
  messages: LLMMessage[],
  options: { temperature?: number } = {}
): Promise<T> {
  const response = await client.chat.completions.create({
    model: env.AZURE_KIMI_MODEL,
    temperature: options.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages
  });

  const raw = extractTextContent(response.choices[0]?.message?.content);
  recordRawResponse(raw);

  if (!raw) {
    throw new LLMResponseParseError("LLM response content was empty.", raw);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new LLMResponseParseError("LLM response must be a JSON object.", raw);
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof LLMResponseParseError) {
      throw error;
    }

    throw new LLMResponseParseError("Failed to parse LLM response as JSON.", raw);
  }
}

export async function callLLMWithMessagesStream<T extends Record<string, unknown>>(
  messages: LLMMessage[],
  options: { temperature?: number } = {},
  onToken: (token: string) => void
): Promise<T> {
  const stream = await client.chat.completions.create({
    model: env.AZURE_KIMI_MODEL,
    temperature: options.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages,
    stream: true
  });

  let raw = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      raw += token;
      onToken(token);
    }
  }

  recordRawResponse(raw);

  if (!raw) {
    throw new LLMResponseParseError("LLM response content was empty.", raw);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new LLMResponseParseError("LLM response must be a JSON object.", raw);
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof LLMResponseParseError) {
      throw error;
    }

    throw new LLMResponseParseError("Failed to parse LLM response as JSON.", raw);
  }
}
