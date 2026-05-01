import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useValidateNode } from "@/hooks/mutation/useValidateNode";
import { useToast } from "@/components/shared/Toast";
const stateColor = {
    pending: "var(--tx3)",
    proposed: "var(--proposed)",
    passed: "var(--passed)",
    failed: "var(--failed)",
    locked: "var(--locked)",
    invalidated: "var(--tx3)"
};
export function StepValidation({ depth, nodes, states, onDiagnose, diagnosing }) {
    const [validating, setValidating] = useState(null);
    const validateNode = useValidateNode();
    const { pushToast } = useToast();
    const busy = validating !== null || diagnosing !== null;
    const onValidate = async (nodeId) => {
        setValidating(nodeId);
        try {
            await validateNode.mutateAsync({ depth, nodeId });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Validation failed", "error");
        }
        finally {
            setValidating(null);
        }
    };
    return (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", marginBottom: 8 }, children: "VALIDATION" }), _jsx("div", { style: { display: "grid", gap: 6 }, children: nodes.map((node) => {
                    const s = states[node.id] ?? "pending";
                    const isPending = s === "pending" || s === "proposed";
                    const isFailed = s === "failed";
                    return (_jsxs("div", { className: "panel", style: { padding: "6px 8px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: node.id }), isPending && (_jsxs("button", { className: "btn", style: { padding: "3px 8px", minWidth: 0, fontSize: 11 }, disabled: busy, onClick: () => void onValidate(node.id), children: [validating === node.id && _jsx(Spinner, {}), "validate"] })), isFailed && (_jsxs("button", { className: "btn", style: { padding: "3px 8px", minWidth: 0, fontSize: 11, borderColor: "var(--failed)", color: "var(--failed)" }, disabled: busy, onClick: () => onDiagnose(node.id), children: [diagnosing === node.id && _jsx(Spinner, {}), "diagnose"] })), !isPending && !isFailed && (_jsx("span", { className: "mono", style: { fontSize: 10, color: stateColor[s], flexShrink: 0 }, children: s === "passed" ? "✓" : s }))] }, node.id));
                }) })] }));
}
