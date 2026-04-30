import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Spinner } from "@/components/shared/Spinner";
const stateLabel = {
    pending: "pending",
    proposed: "proposed",
    passed: "✓ passed",
    failed: "✕ failed",
    locked: "locked",
    invalidated: "invalidated"
};
const stateColor = {
    pending: "var(--tx3)",
    proposed: "var(--proposed)",
    passed: "var(--passed)",
    failed: "var(--failed)",
    locked: "var(--locked)",
    invalidated: "var(--tx3)"
};
export function StepValidation({ nodes, states, onDiagnose, diagnosing }) {
    const failed = nodes.filter((n) => states[n.id] === "failed");
    return (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", marginBottom: 8 }, children: "VALIDATION" }), _jsx("div", { style: { display: "grid", gap: 4, marginBottom: 10 }, children: nodes.map((node) => {
                    const s = states[node.id] ?? "pending";
                    return (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [_jsx("span", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }, children: node.id }), _jsx("span", { className: "mono", style: { fontSize: 10, color: stateColor[s], flexShrink: 0 }, children: stateLabel[s] })] }, node.id));
                }) }), failed.length > 0 && (_jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--failed)" }, children: [failed.length, " node(s) failed"] }), failed.map((n) => (_jsxs("button", { className: "btn", disabled: diagnosing !== null, onClick: () => onDiagnose(n.id), style: { borderColor: "var(--failed)", color: "var(--failed)", display: "flex", alignItems: "center", gap: 6 }, children: [diagnosing === n.id && _jsx(Spinner, {}), "diagnose ", n.id] }, n.id)))] }))] }));
}
