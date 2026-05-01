import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Spinner } from "@/components/shared/Spinner";
export function StepIdle() {
    return (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: "PHASE 2" }), _jsxs("div", { style: { marginTop: 8, fontSize: 12, color: "var(--tx2)", display: "flex", alignItems: "center", gap: 6 }, children: [_jsx(Spinner, {}), "Auto-locking layer \u2014 all checks passed."] })] }));
}
