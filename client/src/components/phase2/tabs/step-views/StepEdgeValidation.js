import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useEdgeValidation } from "@/hooks/mutation/useEdgeValidation";
import { useToast } from "@/components/shared/Toast";
export function StepEdgeValidation({ depth }) {
    const edgeValidation = useEdgeValidation();
    const { pushToast } = useToast();
    const [result, setResult] = useState(null);
    const run = async () => {
        try {
            const data = await edgeValidation.mutateAsync({ depth });
            setResult(data);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Edge validation failed", "error");
        }
    };
    const failedEdges = result ? result.edge_results.filter((e) => !e.passed) : [];
    return (_jsxs("div", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["EDGE VALIDATION \u00B7 L", depth] }), !result && (_jsxs("button", { className: "btn", onClick: () => void run(), disabled: edgeValidation.isPending, children: [edgeValidation.isPending && _jsx(Spinner, {}), "run edge validation"] })), result && (_jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsx("div", { style: { fontSize: 11, color: result.passed ? "var(--passed)" : "var(--failed)" }, children: result.passed ? "✓ All edges valid" : `✕ ${failedEdges.length} edge(s) failed` }), failedEdges.map((edge) => (_jsxs("div", { className: "panel", style: { padding: 8, background: "var(--s2)", borderColor: "var(--failed)" }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10 }, children: [edge.source, " \u2192 ", edge.target] }), edge.issues.map((issue, i) => (_jsxs("div", { style: { fontSize: 11, color: "var(--tx2)", marginTop: 2 }, children: [_jsx("span", { className: "mono", style: { fontSize: 9, color: "var(--proposed)" }, children: issue.type }), " ", issue.description] }, i)))] }, `${edge.source}-${edge.target}`))), result.missing_edges.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", marginTop: 4 }, children: "MISSING EDGES" }), result.missing_edges.map((edge) => (_jsxs("div", { className: "panel", style: { padding: 8, background: "var(--s2)", borderColor: "var(--proposed)" }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10 }, children: [edge.source, " \u2192 ", edge.target] }), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", marginTop: 2 }, children: edge.rationale }), _jsxs("div", { style: { fontSize: 10, color: "var(--tx3)", marginTop: 2 }, children: ["interface: ", edge.suggested_interface, " \u00B7 ", edge.suggested_direction] })] }, `${edge.source}-${edge.target}`)))] })), _jsx("button", { className: "btn", onClick: () => void run(), disabled: edgeValidation.isPending, children: edgeValidation.isPending ? _jsxs(_Fragment, { children: [_jsx(Spinner, {}), "working\u2026"] }) : "re-run edge validation" })] }))] }));
}
