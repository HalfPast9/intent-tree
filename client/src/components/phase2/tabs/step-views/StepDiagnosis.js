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
            await rewrite.mutateAsync({ nodeId });
            onDone();
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Rewrite failed", "error");
        }
    };
    const onTraverse = async () => {
        try {
            await traverse.mutateAsync({ origin_nodes: result.origin_nodes });
            onDone();
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Traversal failed", "error");
        }
    };
    return (_jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: "FAILURE DIAGNOSIS" }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)" }, children: "NODE" }), _jsx("div", { className: "mono", style: { fontSize: 11 }, children: nodeId })] }), result.suggested_action && (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 2 }, children: "SUGGESTED ACTION" }), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)" }, children: result.suggested_action })] })), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 4 }, children: "CLASSIFICATION" }), _jsx("div", { style: { display: "flex", gap: 8 }, children: ["implementation", "design"].map((cls) => (_jsxs("button", { className: "btn", disabled: confirmed, onClick: () => setClassification(cls), style: { borderColor: classification === cls ? "var(--acc)" : "var(--bdr)", color: classification === cls ? "var(--acc)" : "var(--tx2)" }, children: [classification === cls ? "●" : "○", " ", cls] }, cls))) })] }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 2 }, children: "REASONING" }), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", whiteSpace: "pre-wrap" }, children: result.reasoning })] }), !confirmed && (_jsxs("button", { className: "btn btn-pri", onClick: () => void onConfirm(), disabled: confirmDiag.isPending, children: [confirmDiag.isPending && _jsx(Spinner, {}), "confirm"] })), confirmed && classification === "implementation" && (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: "var(--tx2)", marginBottom: 8 }, children: "Implementation error confirmed. Rewrite node based on failed checklist items." }), _jsxs("button", { className: "btn btn-pri", onClick: () => void onRewrite(), disabled: rewrite.isPending, children: [rewrite.isPending && _jsx(Spinner, {}), "rewrite node"] })] })), confirmed && classification === "design" && result.origin_nodes.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx3)", marginBottom: 4 }, children: "ORIGIN NODES" }), result.origin_nodes.map((id) => (_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["\u00B7 ", id] }, id))), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", margin: "8px 0" }, children: "Design error confirmed. Trigger upward traversal to invalidate origin nodes." }), _jsxs("button", { className: "btn btn-pri", onClick: () => void onTraverse(), disabled: traverse.isPending, style: { borderColor: "var(--failed)", color: "var(--failed)", background: "var(--bg-failed)" }, children: [traverse.isPending && _jsx(Spinner, {}), "trigger upward traversal"] })] }))] }));
}
