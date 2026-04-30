import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useGenerateDefinition } from "@/hooks/mutation/useGenerateDefinition";
import { useLockPhase2 } from "@/hooks/mutation/useLockPhase2";
export function StepLayerComplete({ depth, exit }) {
    const generate = useGenerateDefinition();
    const lockPhase2 = useLockPhase2();
    if (!exit)
        return _jsx("div", { style: { fontSize: 12, color: "var(--tx2)" }, children: "Loading exit check..." });
    if (exit.complete) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["LAYER COMPLETE \u00B7 L", depth] }), _jsx("button", { className: "btn btn-pri", style: { marginTop: 8 }, onClick: () => void lockPhase2.mutateAsync(undefined), children: "lock phase 2" })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["LAYER COMPLETE \u00B7 L", depth] }), _jsx("div", { style: { fontSize: 12, marginTop: 8 }, children: "Next layer will decompose:" }), _jsx("div", { style: { marginTop: 6, fontSize: 12, color: "var(--tx2)" }, children: exit.decompose_further_ids.join(", ") || "-" }), _jsx("button", { className: "btn btn-pri", style: { marginTop: 8 }, onClick: () => void generate.mutateAsync({ depth: depth + 1 }), children: "generate next definition" })] }));
}
