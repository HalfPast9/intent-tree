import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import type { DisplayState, NodeView } from "@/api/types";
import { useValidateNode } from "@/hooks/mutation/useValidateNode";
import { useToast } from "@/components/shared/Toast";

type Props = {
  depth: number;
  nodes: NodeView[];
  states: Record<string, DisplayState>;
  onDiagnose: (nodeId: string) => void;
  diagnosing: string | null;
};

const stateColor: Record<DisplayState, string> = {
  pending: "var(--tx3)",
  proposed: "var(--proposed)",
  passed: "var(--passed)",
  failed: "var(--failed)",
  locked: "var(--locked)",
  invalidated: "var(--tx3)"
};

export function StepValidation({ depth, nodes, states, onDiagnose, diagnosing }: Props) {
  const [validating, setValidating] = useState<string | null>(null);
  const validateNode = useValidateNode();
  const { pushToast } = useToast();
  const busy = validating !== null || diagnosing !== null;

  const onValidate = async (nodeId: string) => {
    setValidating(nodeId);
    try {
      await validateNode.mutateAsync({ depth, nodeId });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Validation failed", "error");
    } finally {
      setValidating(null);
    }
  };

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 8 }}>VALIDATION</div>
      <div style={{ display: "grid", gap: 6 }}>
        {nodes.map((node) => {
          const s = states[node.id] ?? "pending";
          const isPending = s === "pending" || s === "proposed";
          const isFailed = s === "failed";
          return (
            <div key={node.id} className="panel" style={{ padding: "6px 8px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--tx2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.id}</span>
              {isPending && (
                <button
                  className="btn"
                  style={{ padding: "3px 8px", minWidth: 0, fontSize: 11 }}
                  disabled={busy}
                  onClick={() => void onValidate(node.id)}
                >
                  {validating === node.id && <Spinner />}validate
                </button>
              )}
              {isFailed && (
                <button
                  className="btn"
                  style={{ padding: "3px 8px", minWidth: 0, fontSize: 11, borderColor: "var(--failed)", color: "var(--failed)" }}
                  disabled={busy}
                  onClick={() => onDiagnose(node.id)}
                >
                  {diagnosing === node.id && <Spinner />}diagnose
                </button>
              )}
              {!isPending && !isFailed && (
                <span className="mono" style={{ fontSize: 10, color: stateColor[s], flexShrink: 0 }}>{s === "passed" ? "✓" : s}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
