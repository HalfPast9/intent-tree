import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useSyntaxCheck } from "@/hooks/mutation/useSyntaxCheck";
import { useToast } from "@/components/shared/Toast";
export function StepSyntaxCheck({ depth }) {
    const syntax = useSyntaxCheck();
    const { pushToast } = useToast();
    const [errors, setErrors] = useState(null);
    const run = async () => {
        try {
            const data = await syntax.mutateAsync({ depth });
            const raw = data.errors;
            setErrors(Array.isArray(raw) ? raw : []);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Syntax check failed", "error");
        }
    };
    return (_jsxs("div", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["SYNTAX CHECK \u00B7 L", depth] }), errors === null && (_jsxs("button", { className: "btn", onClick: () => void run(), disabled: syntax.isPending, children: [syntax.isPending && _jsx(Spinner, {}), "run syntax check"] })), errors === null && syntax.isPending && (_jsx("div", { style: { fontSize: 11, color: "var(--tx2)", marginTop: 6 }, children: "Checking structural rules..." })), errors !== null && (_jsx("div", { children: errors.length === 0 ? (_jsx("div", { style: { fontSize: 11, color: "var(--passed)" }, children: "\u2713 No structural errors. Auto-locking layer..." })) : (_jsxs("div", { style: { display: "grid", gap: 6 }, children: [errors.map((err, i) => (_jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx("span", { style: { color: "var(--failed)" }, children: "\u2715" }), _jsx("span", { style: { fontSize: 11 }, children: err })] }, i))), _jsxs("div", { style: { fontSize: 11, color: "var(--tx2)" }, children: [errors.length, " structural error(s) \u2014 fix nodes, then re-run."] }), _jsxs("button", { className: "btn", onClick: () => void run(), disabled: syntax.isPending, children: [syntax.isPending && _jsx(Spinner, {}), "re-run syntax check"] })] })) }))] }));
}
