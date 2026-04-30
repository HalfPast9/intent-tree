import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const fields = [
    { key: "problem_statement", label: "problem statement" },
    { key: "hard_constraints", label: "hard constraints" },
    { key: "optimization_targets", label: "optimization targets" },
    { key: "success_criteria", label: "success criteria" },
    { key: "out_of_scope", label: "out of scope" },
    { key: "assumptions", label: "assumptions" },
    { key: "nfrs", label: "nfrs" },
    { key: "existing_context", label: "existing context" }
];
export function SpecTab({ spec }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "mono", style: { color: "var(--tx2)", fontSize: 10, marginBottom: 8 }, children: "PHASE 1 SPEC" }), fields.map((field, idx) => ((() => {
                const rawValue = spec?.[field.key];
                const text = typeof rawValue === "string" ? rawValue.trim() : "";
                return (_jsxs("div", { style: { marginBottom: 8 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--bdr-hi)" }, children: ["Section ", idx + 1, " \u00B7 ", field.label] }), _jsx("div", { style: { fontSize: 12, color: "var(--tx1)", whiteSpace: "pre-wrap" }, children: text || "- empty -" })] }, field.key));
            })()))] }));
}
