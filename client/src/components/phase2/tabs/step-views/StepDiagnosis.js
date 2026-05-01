import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useConfirmDiagnosis } from "@/hooks/mutation/useConfirmDiagnosis";
import { useRewriteNode } from "@/hooks/mutation/useRewriteNode";
import { useTraverseUpward } from "@/hooks/mutation/useTraverseUpward";
import { useToast } from "@/components/shared/Toast";
export function StepDiagnosis({ nodeId, result, onDone }) {
    const [classification, setClassification] = useState(result.classification);
    const [confirmed, setConfirmed] = useState(false);
    const [rewriteResult, setRewriteResult] = useState(null);
    const [traversalResult, setTraversalResult] = useState(null);
    const confirmDiag = useConfirmDiagnosis();
    const rewrite = useRewriteNode();
    const traverse = useTraverseUpward();
    const { pushToast } = useToast();
    const onConfirm = async () => {
        try {
            const body = classification !== result.classification ? { classification } : {};
            if (classification === "design" && result.origin_nodes.length > 0) {
                body.origin_nodes = result.origin_nodes;
            }
            await confirmDiag.mutateAsync({ nodeId, body });
            setConfirmed(true);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Confirm failed", "error");
        }
    };
    const onRewrite = async () => {
        try {
            const data = await rewrite.mutateAsync({ nodeId });
            const validation = data.validation;
            setRewriteResult({ passed: validation?.passed ?? false });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Rewrite failed", "error");
        }
    };
    const onTraverse = async () => {
        try {
            const data = await traverse.mutateAsync({ origin_nodes: result.origin_nodes });
            const resp = data;
            setTraversalResult({ invalidated: resp.invalidated, depth: resp.depth });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Traversal failed", "error");
        }
    };
    return (_jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: "FAILURE DIAGNOSIS" }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)" }, children: "NODE" }), _jsx("div", { className: "mono", style: { fontSize: 11 }, children: nodeId })] }), result.suggested_action && (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 2 }, children: "SUGGESTED ACTION" }), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)" }, children: result.suggested_action })] })), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 4 }, children: "CLASSIFICATION" }), _jsx("div", { style: { display: "flex", gap: 8 }, children: ["implementation", "design"].map((cls) => (_jsxs("button", { className: "btn", disabled: confirmed, onClick: () => setClassification(cls), style: { borderColor: classification === cls ? "var(--acc)" : "var(--bdr)", color: classification === cls ? "var(--acc)" : "var(--tx2)" }, children: [classification === cls ? "●" : "○", " ", cls] }, cls))) })] }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 2 }, children: "REASONING" }), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", whiteSpace: "pre-wrap" }, children: result.reasoning })] }), !confirmed && (_jsxs("button", { className: "btn btn-pri", onClick: () => void onConfirm(), disabled: confirmDiag.isPending, children: [confirmDiag.isPending && _jsx(Spinner, {}), "confirm"] })), confirmed && classification === "implementation" && !rewriteResult && (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: "var(--tx2)", marginBottom: 8 }, children: "Implementation error confirmed. Rewrite node based on failed checklist items." }), _jsxs("button", { className: "btn btn-pri", onClick: () => void onRewrite(), disabled: rewrite.isPending, children: [rewrite.isPending && _jsx(Spinner, {}), "rewrite node"] })] })), rewriteResult && (_jsxs("div", { style: { display: "grid", gap: 6, marginTop: 4 }, children: [_jsx("div", { style: { fontSize: 11, color: rewriteResult.passed ? "var(--passed)" : "var(--failed)" }, children: rewriteResult.passed
                            ? "✓ Rewrite complete — node passed re-validation."
                            : "✕ Rewrite complete — node still failing. May need another diagnosis." }), _jsx("button", { className: "btn", onClick: onDone, style: { marginTop: 4 }, children: "back to validation" })] })), confirmed && classification === "design" && result.origin_nodes.length > 0 && !traversalResult && (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 4 }, children: "ORIGIN NODES" }), result.origin_nodes.map((id) => (_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["\u00B7 ", id] }, id))), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", margin: "8px 0" }, children: "Design error confirmed. Trigger upward traversal to invalidate origin nodes and return to the affected layer." }), _jsxs("button", { className: "btn btn-pri", onClick: () => void onTraverse(), disabled: traverse.isPending, style: { borderColor: "var(--failed)", color: "var(--failed)", background: "var(--bg-failed)" }, children: [traverse.isPending && _jsx(Spinner, {}), "trigger upward traversal"] })] })), traversalResult && (_jsxs("div", { style: { display: "grid", gap: 6, marginTop: 4 }, children: [_jsxs("div", { style: { fontSize: 11, color: "var(--tx2)" }, children: ["Upward traversal complete. ", traversalResult.invalidated.length, " node(s) invalidated."] }), traversalResult.invalidated.slice(0, 10).map((id) => (_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--failed)" }, children: ["\u00B7 ", id] }, id))), traversalResult.invalidated.length > 10 && (_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)" }, children: ["+ ", traversalResult.invalidated.length - 10, " more"] })), traversalResult.depth !== null && (_jsxs("div", { style: { fontSize: 11, color: "var(--acc)", marginTop: 4 }, children: ["Returning to layer ", traversalResult.depth, " to re-propose invalidated nodes."] })), _jsx("button", { className: "btn", onClick: onDone, style: { marginTop: 4 }, children: "acknowledge" })] }))] }));
}
