import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "reactflow";
export function SiblingEdge(props) {
    const [path, cx, cy] = getBezierPath(props);
    const isBidirectional = String(props.data?.direction ?? "directed") === "bidirectional";
    const iface = String(props.label ?? props.data?.interface ?? "interface");
    return (_jsxs(_Fragment, { children: [_jsx(BaseEdge, { id: props.id, path: path, style: { stroke: props.selected ? "var(--acc)" : "var(--bdr-hi)", strokeWidth: 1.5 } }), _jsx(EdgeLabelRenderer, { children: _jsxs("div", { style: {
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
                    }, className: "nodrag nopan", children: [iface, " ", isBidirectional ? "<->" : "->"] }) })] }));
}
