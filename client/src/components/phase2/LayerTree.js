import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
const dotByState = {
    pending: ".",
    proposed: "o",
    passed: "v",
    failed: "x",
    locked: "*",
    invalidated: "#"
};
const colorByState = {
    pending: "var(--pending)",
    proposed: "var(--proposed)",
    passed: "var(--passed)",
    failed: "var(--failed)",
    locked: "var(--locked)",
    invalidated: "var(--invalidated)"
};
export function LayerTree({ stackLayers, groupedNodes, displayStates, selectedNodeId, onSelectNode }) {
    return (_jsx("div", { style: { display: "grid", gap: 10 }, children: Object.entries(groupedNodes).map(([depthRaw, nodes]) => {
            const depth = Number(depthRaw);
            const layer = stackLayers[depth]?.layer ?? `Layer ${depth}`;
            return (_jsxs("section", { children: [_jsxs("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10, marginBottom: 4 }, children: ["L", depth, " \u00B7 ", layer] }), _jsx("div", { style: { display: "grid", gap: 2 }, children: nodes.map((node) => {
                            const state = displayStates[node.id] ?? "pending";
                            const selected = selectedNodeId === node.id;
                            return (_jsxs("button", { onClick: () => onSelectNode(node.id), style: {
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
                                }, children: [_jsx("span", { className: "mono", style: { fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: node.id }), _jsx("span", { className: "mono", style: { fontSize: 11, color: colorByState[state], textDecoration: state === "invalidated" ? "line-through" : "none" }, children: dotByState[state] })] }, node.id));
                        }) })] }, depth));
        }) }));
}
