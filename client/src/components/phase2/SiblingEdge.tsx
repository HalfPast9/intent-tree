import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";

export function SiblingEdge(props: EdgeProps) {
  const [path, cx, cy] = getBezierPath(props);
  const isBidirectional = String(props.data?.direction ?? "directed") === "bidirectional";
  const iface = String(props.label ?? props.data?.interface ?? "interface");

  return (
    <>
      <BaseEdge id={props.id} path={path} style={{ stroke: props.selected ? "var(--acc)" : "var(--bdr-hi)", strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${cx}px, ${cy}px)`,
            pointerEvents: "all",
            background: "var(--s2)",
            border: `1px solid ${props.selected ? "var(--acc)" : "var(--bdr)"}`,
            borderRadius: 999,
            padding: "2px 8px",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            font: "400 10px JetBrains Mono, monospace",
            color: "var(--tx1)"
          }}
          className="nodrag nopan"
        >
          {iface} {isBidirectional ? "<->" : "->"}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
