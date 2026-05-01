import { useEffect, useState } from "react";

import type { LayerCriteriaDoc } from "@/api/types";
import { Spinner } from "@/components/shared/Spinner";
import { useGenerateDefinition } from "@/hooks/mutation/useGenerateDefinition";
import { useApproveDefinition } from "@/hooks/mutation/useApproveDefinition";
import { useToast } from "@/components/shared/Toast";

type Props = { depth: number; definition: LayerCriteriaDoc | null };

type Draft = {
  layer_name: string;
  responsibility_scope: string;
  considerations: string;
  out_of_scope: string;
  checklist_template: string;
};

function toChecklistArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      return value.split("\n").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function defToDraft(d: LayerCriteriaDoc | null): Draft {
  return {
    layer_name: d?.layer_name ?? "",
    responsibility_scope: d?.responsibility_scope ?? "",
    considerations: d?.considerations ?? "",
    out_of_scope: d?.out_of_scope ?? "",
    checklist_template: toChecklistArray(d?.checklist_template).join("\n")
  };
}

const inputStyle: React.CSSProperties = {
  background: "var(--s2)",
  border: "1px solid var(--bdr)",
  borderRadius: 4,
  color: "var(--tx1)",
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
  fontFamily: "inherit",
  resize: "vertical" as const
};

export function StepLayerDefinition({ depth, definition }: Props) {
  const generate = useGenerateDefinition();
  const approve = useApproveDefinition();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<Draft>(defToDraft(definition));
  const [userEdited, setUserEdited] = useState(false);

  // Sync draft when definition first arrives (not if user has started editing)
  useEffect(() => {
    if (definition && !userEdited) {
      setDraft(defToDraft(definition));
    }
  }, [definition, userEdited]);

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setUserEdited(true);
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  };

  const hasDefinition = Boolean(definition);

  const isChanged = !definition
    ? true
    : draft.layer_name !== definition.layer_name ||
      draft.responsibility_scope !== definition.responsibility_scope ||
      draft.considerations !== definition.considerations ||
      draft.out_of_scope !== definition.out_of_scope ||
      draft.checklist_template !== toChecklistArray(definition.checklist_template).join("\n");

  const onGenerate = async () => {
    try {
      await generate.mutateAsync({ depth });
      setUserEdited(false);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to generate definition", "error");
    }
  };

  const onApprove = async () => {
    try {
      const body = isChanged
        ? {
            layer_name: draft.layer_name,
            responsibility_scope: draft.responsibility_scope,
            considerations: draft.considerations,
            out_of_scope: draft.out_of_scope,
            checklist_template: draft.checklist_template.split("\n").map((s) => s.trim()).filter(Boolean)
          }
        : {};
      await approve.mutateAsync({ depth, body });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to approve definition", "error");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>LAYER DEFINITION · L{depth}</div>

      {!hasDefinition && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--tx2)" }}>No definition yet for this layer.</div>
          <button className="btn btn-pri" onClick={() => void onGenerate()} disabled={generate.isPending}>
            {generate.isPending && <Spinner />}generate definition
          </button>
          {generate.isPending && (
            <div style={{ fontSize: 11, color: "var(--tx2)" }}>LLM is defining layer — this may take a moment...</div>
          )}
        </div>
      )}

      {hasDefinition && (
        <>
          <div>
            <div className="mono" style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 2 }}>LAYER NAME</div>
            <input style={inputStyle} value={draft.layer_name} onChange={set("layer_name")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 2 }}>RESPONSIBILITY SCOPE</div>
            <textarea rows={3} style={inputStyle} value={draft.responsibility_scope} onChange={set("responsibility_scope")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 2 }}>CONSIDERATIONS</div>
            <textarea rows={2} style={inputStyle} value={draft.considerations} onChange={set("considerations")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 2 }}>OUT OF SCOPE</div>
            <textarea rows={2} style={inputStyle} value={draft.out_of_scope} onChange={set("out_of_scope")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 2 }}>CHECKLIST TEMPLATE (one per line)</div>
            <textarea rows={4} style={inputStyle} value={draft.checklist_template} onChange={set("checklist_template")} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => void onGenerate()} disabled={generate.isPending}>
              {generate.isPending && <Spinner />}regenerate
            </button>
            <button className="btn btn-pri" onClick={() => void onApprove()} disabled={approve.isPending}>
              {approve.isPending && <Spinner />}approve
            </button>
          </div>
        </>
      )}
    </div>
  );
}
