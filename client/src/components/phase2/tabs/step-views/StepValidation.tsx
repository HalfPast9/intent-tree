import { Spinner } from "@/components/shared/Spinner";
import type { DisplayState, NodeView } from "@/api/types";

type Props = {
  nodes: NodeView[];
  states: Record<string, DisplayState>;
  onDiagnose: (nodeId: string) => void;
  diagnosing: string | null;
};

const stateLabel: Record<DisplayState, string> = {
  pending: "pending",
  proposed: "proposed",
  passed: "✓ passed",
  failed: "✕ failed",
  locked: "locked",
  invalidated: "invalidated"
};

const stateColor: Record<DisplayState, string> = {
  pending: "var(--tx3)",
  proposed: "var(--proposed)",
  passed: "var(--passed)",
  failed: "var(--failed)",
  locked: "var(--locked)",
  invalidated: "var(--tx3)"
};

export function StepValidation({ nodes, states, onDiagnose, diagnosing }: Props) {
  const failed = nodes.filter((n) => states[n.id] === "failed");

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 8 }}>VALIDATION</div>
      <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
        {nodes.map((node) => {
          const s = states[node.id] ?? "pending";
          return (
            <div key={node.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{node.id}</span>
              <span className="mono" style={{ fontSize: 10, color: stateColor[s], flexShrink: 0 }}>{stateLabel[s]}</span>
            </div>
          );
        })}
      </div>
      {failed.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--failed)" }}>{failed.length} node(s) failed</div>
          {failed.map((n) => (
            <button
              key={n.id}
              className="btn"
              disabled={diagnosing !== null}
              onClick={() => onDiagnose(n.id)}
              style={{ borderColor: "var(--failed)", color: "var(--failed)", display: "flex", alignItems: "center", gap: 6 }}
            >
              {diagnosing === n.id && <Spinner />}
              diagnose {n.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
