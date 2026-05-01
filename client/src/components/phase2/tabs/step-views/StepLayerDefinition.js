import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useGenerateDefinition } from "@/hooks/mutation/useGenerateDefinition";
import { useApproveDefinition } from "@/hooks/mutation/useApproveDefinition";
import { useToast } from "@/components/shared/Toast";
function toChecklistArray(value) {
    if (Array.isArray(value)) {
        return value.filter((v) => typeof v === "string");
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((v) => typeof v === "string");
            }
        }
        catch {
            return value.split("\n").map((s) => s.trim()).filter(Boolean);
        }
    }
    return [];
}
function defToDraft(d) {
    return {
        layer_name: d?.layer_name ?? "",
        responsibility_scope: d?.responsibility_scope ?? "",
        considerations: d?.considerations ?? "",
        out_of_scope: d?.out_of_scope ?? "",
        checklist_template: toChecklistArray(d?.checklist_template).join("\n")
    };
}
const inputStyle = {
    background: "var(--s2)",
    border: "1px solid var(--bdr)",
    borderRadius: 4,
    color: "var(--tx1)",
    padding: "6px 8px",
    fontSize: 12,
    width: "100%",
    fontFamily: "inherit",
    resize: "vertical"
};
export function StepLayerDefinition({ depth, definition }) {
    const generate = useGenerateDefinition();
    const approve = useApproveDefinition();
    const { pushToast } = useToast();
    const [draft, setDraft] = useState(defToDraft(definition));
    const [userEdited, setUserEdited] = useState(false);
    // Sync draft when definition first arrives (not if user has started editing)
    useEffect(() => {
        if (definition && !userEdited) {
            setDraft(defToDraft(definition));
        }
    }, [definition, userEdited]);
    const set = (key) => (e) => {
        setUserEdited(true);
        setDraft((d) => ({ ...d, [key]: e.target.value }));
    };
    const hasDefinition = Boolean(definition);
    const isChanged = !definition
        ? true
        : draft.layer_name !== definition.layer_name ||
            draft.responsibility_scope !== definition.responsibility_scope ||
            draft.considerations !== definition.considerations ||
            draft.out_of_scope !== definition.out_of_scope ||
            draft.checklist_template !== toChecklistArray(definition.checklist_template).join("\n");
    const onGenerate = async () => {
        try {
            await generate.mutateAsync({ depth });
            setUserEdited(false);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Failed to generate definition", "error");
        }
    };
    const onApprove = async () => {
        try {
            const body = isChanged
                ? {
                    layer_name: draft.layer_name,
                    responsibility_scope: draft.responsibility_scope,
                    considerations: draft.considerations,
                    out_of_scope: draft.out_of_scope,
                    checklist_template: draft.checklist_template.split("\n").map((s) => s.trim()).filter(Boolean)
                }
                : {};
            await approve.mutateAsync({ depth, body });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Failed to approve definition", "error");
        }
    };
    return (_jsxs("div", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["LAYER DEFINITION \u00B7 L", depth] }), !hasDefinition && (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: "var(--tx2)", marginBottom: 8 }, children: "No definition yet for this layer." }), _jsxs("button", { className: "btn btn-pri", onClick: () => void onGenerate(), disabled: generate.isPending, children: [generate.isPending && _jsx(Spinner, {}), "generate definition"] })] })), hasDefinition && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", marginBottom: 2 }, children: "LAYER NAME" }), _jsx("input", { style: inputStyle, value: draft.layer_name, onChange: set("layer_name") })] }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", marginBottom: 2 }, children: "RESPONSIBILITY SCOPE" }), _jsx("textarea", { rows: 3, style: inputStyle, value: draft.responsibility_scope, onChange: set("responsibility_scope") })] }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", marginBottom: 2 }, children: "CONSIDERATIONS" }), _jsx("textarea", { rows: 2, style: inputStyle, value: draft.considerations, onChange: set("considerations") })] }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", marginBottom: 2 }, children: "OUT OF SCOPE" }), _jsx("textarea", { rows: 2, style: inputStyle, value: draft.out_of_scope, onChange: set("out_of_scope") })] }), _jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 9, color: "var(--tx3)", marginBottom: 2 }, children: "CHECKLIST TEMPLATE (one per line)" }), _jsx("textarea", { rows: 4, style: inputStyle, value: draft.checklist_template, onChange: set("checklist_template") })] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsxs("button", { className: "btn", onClick: () => void onGenerate(), disabled: generate.isPending, children: [generate.isPending && _jsx(Spinner, {}), "regenerate"] }), _jsxs("button", { className: "btn btn-pri", onClick: () => void onApprove(), disabled: approve.isPending, children: [approve.isPending && _jsx(Spinner, {}), "approve"] })] })] }))] }));
}
