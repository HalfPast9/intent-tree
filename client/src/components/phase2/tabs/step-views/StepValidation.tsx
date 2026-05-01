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
  const [validatingAll, setValidatingAll] = useState(false);
  const validateNode = useValidateNode();
  const { pushToast } = useToast();
  const busy = validating !== null || validatingAll || diagnosing !== null;

  const activeNodes = nodes.filter((n) => n.state !== "invalidated");

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

  const onValidateAll = async () => {
    setValidatingAll(true);
    try {
      const pending = activeNodes.filter((n) => {
        const s = states[n.id] ?? "pending";
        return s === "pending" || s === "proposed" || s === "failed";
      });
      for (const node of pending) {
        setValidating(node.id);
        try {
          await validateNode.mutateAsync({ depth, nodeId: node.id });
        } catch (error) {
          pushToast(`${node.id}: ${error instanceof Error ? error.message : "failed"}`, "error");
        }
      }
    } finally {
      setValidating(null);
      setValidatingAll(false);
    }
  };

  const pendingCount = activeNodes.filter((n) => {
    const s = states[n.id] ?? "pending";
    return s === "pending" || s === "proposed" || s === "failed";
  }).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>VALIDATION · L{depth}</div>
        {pendingCount > 1 && (
          <button
            className="btn"
            style={{ padding: "3px 8px", minWidth: 0, fontSize: 10 }}
            disabled={busy}
            onClick={() => void onValidateAll()}
          >
            {validatingAll && <Spinner />}validate all ({pendingCount})
          </button>
        )}
      </div>
      {validatingAll && (
        <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <Spinner />Validating nodes — this may take a minute...
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {activeNodes.map((node) => {
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
                <>
                  <button
                    className="btn"
                    style={{ padding: "3px 8px", minWidth: 0, fontSize: 11 }}
                    disabled={busy}
                    onClick={() => void onValidate(node.id)}
                  >
                    {validating === node.id && <Spinner />}retry
                  </button>
                  <button
                    className="btn"
                    style={{ padding: "3px 8px", minWidth: 0, fontSize: 11, borderColor: "var(--failed)", color: "var(--failed)" }}
                    disabled={busy}
                    onClick={() => onDiagnose(node.id)}
                  >
                    {diagnosing === node.id && <Spinner />}diagnose
                  </button>
                </>
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
