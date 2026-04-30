import type { DisplayState, NodeView, StackLayer } from "@/api/types";

const dotByState: Record<DisplayState, string> = {
  pending: ".",
  proposed: "o",
  passed: "v",
  failed: "x",
  locked: "*",
  invalidated: "#"
};

const colorByState: Record<DisplayState, string> = {
  pending: "var(--pending)",
  proposed: "var(--proposed)",
  passed: "var(--passed)",
  failed: "var(--failed)",
  locked: "var(--locked)",
  invalidated: "var(--invalidated)"
};

type LayerTreeProps = {
  stackLayers: StackLayer[];
  groupedNodes: Record<number, NodeView[]>;
  displayStates: Record<string, DisplayState>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

export function LayerTree({ stackLayers, groupedNodes, displayStates, selectedNodeId, onSelectNode }: LayerTreeProps) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Object.entries(groupedNodes).map(([depthRaw, nodes]) => {
        const depth = Number(depthRaw);
        const layer = stackLayers[depth]?.layer ?? `Layer ${depth}`;

        return (
          <section key={depth}>
            <div className="mono" style={{ color: "var(--tx3)", fontSize: 10, marginBottom: 4 }}>
              L{depth} · {layer}
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              {nodes.map((node) => {
                const state = displayStates[node.id] ?? "pending";
                const selected = selectedNodeId === node.id;
                return (
                  <button
                    key={node.id}
                    onClick={() => onSelectNode(node.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "6px 8px",
                      border: "1px solid var(--bdr)",
                      borderLeft: selected ? "2px solid var(--acc)" : "1px solid var(--bdr)",
                      background: "var(--s2)",
                      color: "var(--tx1)",
                      textAlign: "left",
                      cursor: "pointer",
                      borderRadius: 4
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.id}</span>
                    <span className="mono" style={{ fontSize: 11, color: colorByState[state], textDecoration: state === "invalidated" ? "line-through" : "none" }}>{dotByState[state]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
