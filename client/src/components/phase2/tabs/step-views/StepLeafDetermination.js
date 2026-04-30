import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useDetermineLeaf } from "@/hooks/mutation/useDetermineLeaf";
import { useConfirmLeaf } from "@/hooks/mutation/useConfirmLeaf";
import { useToast } from "@/components/shared/Toast";
import { Spinner } from "@/components/shared/Spinner";
export function StepLeafDetermination({ depth, nodes }) {
    const determine = useDetermineLeaf();
    const confirm = useConfirmLeaf();
    const { pushToast } = useToast();
    const [overrides, setOverrides] = useState({});
    const leafReady = useMemo(() => nodes.some((n) => n.leaf !== null), [nodes]);
    const onDetermine = async () => {
        try {
            await determine.mutateAsync({ depth });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Leaf determination failed", "error");
        }
    };
    const onConfirm = async () => {
        try {
            await confirm.mutateAsync({
                depth,
                body: Object.keys(overrides).length > 0 ? { overrides } : {}
            });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Leaf confirmation failed", "error");
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", marginBottom: 8 }, children: ["LEAF DETERMINATION \u00B7 L", depth] }), !leafReady && (_jsx("button", { className: "btn", onClick: () => void onDetermine(), disabled: determine.isPending, children: determine.isPending ? _jsx(Spinner, {}) : "determine leaf nodes" })), leafReady && (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }, children: nodes.map((node) => {
                            const effective = overrides[node.id] ?? node.leaf;
                            return (_jsxs("div", { className: "panel", style: { padding: 8, background: "var(--s2)" }, children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: node.id }), _jsx("div", { style: { fontSize: 12, marginBottom: 6 }, children: node.intent }), _jsx("div", { style: { display: "flex", gap: 6 }, children: ["leaf", "decompose_further"].map((cls) => (_jsx("button", { className: "btn", onClick: () => setOverrides((prev) => ({ ...prev, [node.id]: cls })), style: { borderColor: effective === cls ? "var(--acc)" : "var(--bdr)", color: effective === cls ? "var(--acc)" : "var(--tx2)" }, children: cls === "leaf" ? "leaf" : "decompose further" }, cls))) })] }, node.id));
                        }) }), _jsx("button", { className: "btn btn-pri", style: { marginTop: 8 }, onClick: () => void onConfirm(), disabled: confirm.isPending, children: confirm.isPending ? _jsx(Spinner, {}) : "confirm" })] }))] }));
}
