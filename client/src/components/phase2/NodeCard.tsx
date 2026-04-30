import { Handle, Position, type NodeProps } from "reactflow";
import type { DisplayState } from "@/api/types";

type NodeData = {
  id: string;
  intent: string;
  inputs: string;
  outputs: string;
  leaf: string | null;
  state: DisplayState;
};

const borderByState: Record<DisplayState, string> = {
  pending: "var(--bdr)",
  proposed: "var(--proposed)",
  passed: "var(--passed)",
  failed: "var(--failed)",
  locked: "var(--locked)",
  invalidated: "var(--bdr)"
};

const bgByState: Record<DisplayState, string> = {
  pending: "var(--s2)",
  proposed: "var(--bg-proposed)",
  passed: "var(--bg-passed)",
  failed: "var(--bg-failed)",
  locked: "var(--bg-locked)",
  invalidated: "var(--bg)"
};

const handleStyle = { background: "var(--bdr-hi)", width: 6, height: 6, border: "none" };

export function NodeCard({ selected, data }: NodeProps<NodeData>) {
  const d = data;
  return (
    <>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <div
      style={{
        width: 200,
        minHeight: 80,
        border: `1.5px ${d.state === "invalidated" ? "dashed" : "solid"} ${borderByState[d.state]}`,
        background: bgByState[d.state],
        borderRadius: 4,
        padding: 8,
        boxShadow: selected ? "0 0 0 2px var(--acc) inset" : "none"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span className="mono" style={{ fontSize: 9, color: "var(--tx3)", textDecoration: d.state === "invalidated" ? "line-through" : "none" }}>
          {d.id}
        </span>
        <span className="mono" style={{ fontSize: 8, color: borderByState[d.state] }}>{d.state}</span>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {d.intent}
      </div>
      {d.leaf === "leaf" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            in: {d.inputs || "-"}
          </span>
          <span className="mono" style={{ fontSize: 9, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            out: {d.outputs || "-"}
          </span>
        </div>
      )}
    </div>
    <Handle type="source" position={Position.Right} style={handleStyle} />
    </>
  );
}
