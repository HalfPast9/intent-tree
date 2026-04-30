import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Handle, Position } from "reactflow";
const borderByState = {
    pending: "var(--bdr)",
    proposed: "var(--proposed)",
    passed: "var(--passed)",
    failed: "var(--failed)",
    locked: "var(--locked)",
    invalidated: "var(--bdr)"
};
const bgByState = {
    pending: "var(--s2)",
    proposed: "var(--bg-proposed)",
    passed: "var(--bg-passed)",
    failed: "var(--bg-failed)",
    locked: "var(--bg-locked)",
    invalidated: "var(--bg)"
};
const handleStyle = { background: "var(--bdr-hi)", width: 6, height: 6, border: "none" };
export function NodeCard({ selected, data }) {
    const d = data;
    return (_jsxs(_Fragment, { children: [_jsx(Handle, { type: "target", position: Position.Left, style: handleStyle }), _jsxs("div", { style: {
                    width: 200,
                    minHeight: 80,
                    border: `1.5px ${d.state === "invalidated" ? "dashed" : "solid"} ${borderByState[d.state]}`,
                    background: bgByState[d.state],
                    borderRadius: 4,
                    padding: 8,
                    boxShadow: selected ? "0 0 0 2px var(--acc) inset" : "none"
                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 6 }, children: [_jsx("span", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", textDecoration: d.state === "invalidated" ? "line-through" : "none" }, children: d.id }), _jsx("span", { className: "mono", style: { fontSize: 8, color: borderByState[d.state] }, children: d.state })] }), _jsx("div", { style: { fontSize: 11.5, lineHeight: 1.35, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }, children: d.intent }), d.leaf === "leaf" && (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8 }, children: [_jsxs("span", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ["in: ", d.inputs || "-"] }), _jsxs("span", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ["out: ", d.outputs || "-"] })] }))] }), _jsx(Handle, { type: "source", position: Position.Right, style: handleStyle })] }));
}
