import { randomUUID } from "node:crypto";

import {
  createEvent,
  createProblemSpec,
  getProblemSpecById,
  updateProblemSpec
} from "../db/index.js";
import { callLLM, callLLMWithMessages, LLMMessage } from "../llm/client.js";
import { EventActor } from "../models/event.js";
import { ProblemSpec } from "../models/problemSpec.js";
import { transitionSessionToPhase2 } from "../phase2/service.js";
import {
  buildPrompt1,
  buildPrompt1SystemPrompt,
  buildPrompt2,
  ChatTurn,
  isPhase1SpecComplete,
  PHASE1_FIELDS,
  Prompt1Response,
  Prompt2Conflict,
  Prompt2Response,
  Phase1SpecField
} from "./prompts.js";

const PHASE1_SPEC_ID = "spec-url-shortener";

const DEFAULT_SPEC: ProblemSpec = {
  id: PHASE1_SPEC_ID,
  problem_statement: "",
  hard_constraints: "",
  optimization_targets: "",
  success_criteria: "",
  out_of_scope: "",
  assumptions: "",
  nfrs: "",
  existing_context: "",
  locked: false
};

const chatHistory: ChatTurn[] = [];
const activeConflicts = new Set<string>();

function nowIso(): string {
  return new Date().toISOString();
}

function conflictKey(conflict: Prompt2Conflict): string {
  const normalizedFields = [...conflict.fields].sort().join("|");
  return `${normalizedFields}::${conflict.tension.trim()}`;
}

function isPhase1Field(value: string): value is Phase1SpecField {
  return (PHASE1_FIELDS as string[]).includes(value);
}

function validatePrompt1Response(payload: Record<string, unknown>): Prompt1Response {
  const message = typeof payload.message === "string" ? payload.message : "";
  const rawUpdate = payload.spec_update;

  if (!message) {
    throw new Error("Prompt 1 response is missing a valid 'message' string.");
  }

  if (typeof rawUpdate !== "object" || rawUpdate === null || Array.isArray(rawUpdate)) {
    throw new Error("Prompt 1 response must include 'spec_update' as an object.");
  }

  const spec_update: Partial<Record<Phase1SpecField, string>> = {};

  for (const [key, value] of Object.entries(rawUpdate)) {
    if (!isPhase1Field(key)) {
      continue;
    }

    if (typeof value === "string") {
      spec_update[key] = value;
    }
  }

  return { message, spec_update };
}

function validatePrompt2Response(payload: Record<string, unknown>): Prompt2Response {
  const clean = Boolean(payload.clean);
  const rawConflicts = Array.isArray(payload.conflicts) ? payload.conflicts : [];

  const conflicts: Prompt2Conflict[] = rawConflicts
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }

      const fieldsRaw = Array.isArray(entry.fields) ? entry.fields : [];
      const fields = fieldsRaw.filter((value: unknown): value is Phase1SpecField =>
        typeof value === "string" ? isPhase1Field(value) : false
      );

      const tension = typeof entry.tension === "string" ? entry.tension : "";
      const question = typeof entry.question === "string" ? entry.question : "";

      if (!fields.length || !tension || !question) {
        return null;
      }

      return { fields, tension, question };
    })
    .filter((value): value is Prompt2Conflict => value !== null);

  return { clean, conflicts };
}

async function emitEvent(
  type: string,
  actor: EventActor,
  payload: Record<string, unknown>
): Promise<void> {
  await createEvent({
    id: randomUUID(),
    type,
    timestamp: nowIso(),
    actor,
    node_ids: [PHASE1_SPEC_ID],
    payload: JSON.stringify(payload)
  });
}

export async function getOrCreatePhase1Spec(): Promise<ProblemSpec> {
  const existing = await getProblemSpecById(PHASE1_SPEC_ID);

  if (existing) {
    return existing;
  }

  return createProblemSpec(DEFAULT_SPEC);
}

async function applySpecUpdate(
  spec: ProblemSpec,
  specUpdate: Partial<Record<Phase1SpecField, string>>,
  actor: EventActor
): Promise<ProblemSpec> {
  if (spec.locked) {
    throw new Error("Phase 1 is locked and read-only.");
  }

  const changed: Partial<Record<Phase1SpecField, string>> = {};

  for (const field of PHASE1_FIELDS) {
    const incoming = specUpdate[field];

    if (incoming === undefined) {
      continue;
    }

    if (spec[field] !== incoming) {
      changed[field] = incoming;
    }
  }

  if (!Object.keys(changed).length) {
    return spec;
  }

  const updated = await updateProblemSpec(PHASE1_SPEC_ID, changed);

  if (!updated) {
    throw new Error("Failed to update Phase 1 spec.");
  }

  for (const [field, value] of Object.entries(changed)) {
    await emitEvent("spec_field_updated", actor, {
      field,
      value,
      source: "prompt1"
    });
  }

  return updated;
}

export async function runConflictCheck(): Promise<{ spec: ProblemSpec; result: Prompt2Response }> {
  const spec = await getOrCreatePhase1Spec();

  if (!isPhase1SpecComplete(spec)) {
    return {
      spec,
      result: {
        clean: false,
        conflicts: []
      }
    };
  }

  const prompt = buildPrompt2(spec);
  const raw = await callLLM<Record<string, unknown>>(prompt, {
    systemPrompt: "Return only strict JSON for Prompt 2 conflict check."
  });
  const result = validatePrompt2Response(raw);

  const currentKeys = new Set<string>();

  for (const conflict of result.conflicts) {
    const key = conflictKey(conflict);
    currentKeys.add(key);
    await emitEvent("conflict_detected", "llm", {
      fields: conflict.fields,
      tension: conflict.tension,
      question: conflict.question
    });
  }

  for (const previousKey of activeConflicts) {
    if (!currentKeys.has(previousKey)) {
      await emitEvent("conflict_resolved", "human", {
        key: previousKey
      });
    }
  }

  activeConflicts.clear();

  for (const key of currentKeys) {
    activeConflicts.add(key);
  }

  return { spec, result };
}

export async function processUserMessage(userMessage: string): Promise<{
  message: string;
  spec: ProblemSpec;
  clean: boolean;
  conflicts: Prompt2Conflict[];
}> {
  const currentSpec = await getOrCreatePhase1Spec();

  if (currentSpec.locked) {
    throw new Error("Phase 1 is locked and read-only.");
  }

  const prompt = buildPrompt1(currentSpec, userMessage);
  const messages: LLMMessage[] = [
    { role: "system", content: buildPrompt1SystemPrompt() },
    ...chatHistory,
    { role: "user", content: prompt }
  ];

  const raw = await callLLMWithMessages<Record<string, unknown>>(messages, {
    temperature: 0.2
  });
  const llmResponse = validatePrompt1Response(raw);

  const updatedSpec = await applySpecUpdate(currentSpec, llmResponse.spec_update, "llm");

  chatHistory.push({ role: "user", content: userMessage });
  chatHistory.push({ role: "assistant", content: llmResponse.message });

  if (!isPhase1SpecComplete(updatedSpec)) {
    return {
      message: llmResponse.message,
      spec: updatedSpec,
      clean: false,
      conflicts: []
    };
  }

  const { result } = await runConflictCheck();

  return {
    message: llmResponse.message,
    spec: (await getOrCreatePhase1Spec()),
    clean: result.clean,
    conflicts: result.conflicts
  };
}

export async function lockPhase1(): Promise<ProblemSpec> {
  const spec = await getOrCreatePhase1Spec();

  if (spec.locked) {
    return spec;
  }

  if (!isPhase1SpecComplete(spec)) {
    throw new Error("Cannot lock Phase 1 before all required fields are populated.");
  }

  const { result } = await runConflictCheck();

  if (!result.clean) {
    throw new Error("Cannot lock Phase 1 while conflicts are unresolved.");
  }

  const lockedSpec = await updateProblemSpec(PHASE1_SPEC_ID, { locked: true });

  if (!lockedSpec) {
    throw new Error("Failed to lock Phase 1.");
  }

  await emitEvent("phase1_locked", "human", { phase: "phase1" });
  await emitEvent("phase_transitioned", "human", { from: "phase1", to: "phase2" });
  await transitionSessionToPhase2();

  return lockedSpec;
}
