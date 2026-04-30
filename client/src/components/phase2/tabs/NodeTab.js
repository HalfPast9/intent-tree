import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useEditNode } from "@/hooks/mutation/useEditNode";
import { useDiagnoseNode } from "@/hooks/mutation/useDiagnoseNode";
import { useToast } from "@/components/shared/Toast";
export function NodeTab({ node, edge, state, depth, onDiagnosed }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ intent: "", inputs: "", outputs: "" });
    const editNode = useEditNode();
    const diagnoseNode = useDiagnoseNode();
    const { pushToast } = useToast();
    if (!node && !edge) {
        return _jsx("div", { style: { color: "var(--tx2)", fontSize: 12 }, children: "No node selected. Click a node or edge in the canvas." });
    }
    if (edge) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "mono", style: { fontSize: 11, color: "var(--tx2)" }, children: ["edge \u00B7 ", edge.source, " ", "->", " ", edge.target] }), _jsxs("div", { style: { marginTop: 8, fontSize: 12 }, children: [_jsx("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10 }, children: "INTERFACE" }), _jsx("div", { children: edge.interface }), _jsx("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10, marginTop: 8 }, children: "DIRECTION" }), _jsx("div", { children: edge.direction })] })] }));
    }
    if (!node)
        return null;
    const save = async () => {
        try {
            await editNode.mutateAsync({
                depth,
                nodeId: node.id,
                body: {
                    intent: form.intent || undefined,
                    inputs: form.inputs || undefined,
                    outputs: form.outputs || undefined
                }
            });
            setEditing(false);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Failed to edit node", "error");
        }
    };
    const diagnose = async () => {
        try {
            await diagnoseNode.mutateAsync({ nodeId: node.id });
            onDiagnosed();
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Failed to diagnose node", "error");
        }
    };
    return (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { color: "var(--tx2)", fontSize: 11 }, children: node.id }), _jsx("div", { style: { fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }, children: node.intent }), _jsx("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10, marginTop: 8 }, children: "STATE" }), _jsx("div", { style: { fontSize: 12 }, children: state ?? "pending" }), _jsx("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10, marginTop: 8 }, children: "PARENTS" }), _jsx("div", { style: { fontSize: 12 }, children: node.parents.join(", ") || "-" }), _jsx("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10, marginTop: 8 }, children: "INPUTS" }), _jsx("div", { style: { fontSize: 12 }, children: node.inputs || "-" }), _jsx("div", { className: "mono", style: { color: "var(--tx3)", fontSize: 10, marginTop: 8 }, children: "OUTPUTS" }), _jsx("div", { style: { fontSize: 12 }, children: node.outputs || "-" }), editing && (_jsxs("div", { className: "panel", style: { marginTop: 8, padding: 8, display: "grid", gap: 6 }, children: [_jsx("textarea", { rows: 3, placeholder: "intent", value: form.intent, onChange: (e) => setForm((p) => ({ ...p, intent: e.target.value })) }), _jsx("input", { placeholder: "inputs", value: form.inputs, onChange: (e) => setForm((p) => ({ ...p, inputs: e.target.value })) }), _jsx("input", { placeholder: "outputs", value: form.outputs, onChange: (e) => setForm((p) => ({ ...p, outputs: e.target.value })) }), _jsx("button", { className: "btn btn-pri", onClick: () => void save(), children: "save" })] })), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [_jsx("button", { className: "btn", onClick: () => setEditing((v) => !v), children: "edit node" }), state === "failed" && _jsx("button", { className: "btn btn-pri", onClick: () => void diagnose(), children: "diagnose" })] })] }));
}
