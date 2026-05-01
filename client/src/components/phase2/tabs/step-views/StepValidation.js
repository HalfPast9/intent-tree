import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
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
    const [validatingAll, setValidatingAll] = useState(false);
    const validateNode = useValidateNode();
    const { pushToast } = useToast();
    const busy = validating !== null || validatingAll || diagnosing !== null;
    const activeNodes = nodes.filter((n) => n.state !== "invalidated");
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
                }
                catch (error) {
                    pushToast(`${node.id}: ${error instanceof Error ? error.message : "failed"}`, "error");
                }
            }
        }
        finally {
            setValidating(null);
            setValidatingAll(false);
        }
    };
    const pendingCount = activeNodes.filter((n) => {
        const s = states[n.id] ?? "pending";
        return s === "pending" || s === "proposed" || s === "failed";
    }).length;
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["VALIDATION \u00B7 L", depth] }), pendingCount > 1 && (_jsxs("button", { className: "btn", style: { padding: "3px 8px", minWidth: 0, fontSize: 10 }, disabled: busy, onClick: () => void onValidateAll(), children: [validatingAll && _jsx(Spinner, {}), "validate all (", pendingCount, ")"] }))] }), validatingAll && (_jsxs("div", { style: { fontSize: 11, color: "var(--tx2)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }, children: [_jsx(Spinner, {}), "Validating nodes \u2014 this may take a minute..."] })), _jsx("div", { style: { display: "grid", gap: 6 }, children: activeNodes.map((node) => {
                    const s = states[node.id] ?? "pending";
                    const isPending = s === "pending" || s === "proposed";
                    const isFailed = s === "failed";
                    return (_jsxs("div", { className: "panel", style: { padding: "6px 8px", background: "var(--s2)", display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: node.id }), isPending && (_jsxs("button", { className: "btn", style: { padding: "3px 8px", minWidth: 0, fontSize: 11 }, disabled: busy, onClick: () => void onValidate(node.id), children: [validating === node.id && _jsx(Spinner, {}), "validate"] })), isFailed && (_jsxs(_Fragment, { children: [_jsxs("button", { className: "btn", style: { padding: "3px 8px", minWidth: 0, fontSize: 11 }, disabled: busy, onClick: () => void onValidate(node.id), children: [validating === node.id && _jsx(Spinner, {}), "retry"] }), _jsxs("button", { className: "btn", style: { padding: "3px 8px", minWidth: 0, fontSize: 11, borderColor: "var(--failed)", color: "var(--failed)" }, disabled: busy, onClick: () => onDiagnose(node.id), children: [diagnosing === node.id && _jsx(Spinner, {}), "diagnose"] })] })), !isPending && !isFailed && (_jsx("span", { className: "mono", style: { fontSize: 10, color: stateColor[s], flexShrink: 0 }, children: s === "passed" ? "✓" : s }))] }, node.id));
                }) })] }));
}
