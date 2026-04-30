import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const fields = [
    { key: "problem_statement", label: "problem statement", sect: "I" },
    { key: "hard_constraints", label: "hard constraints", sect: "II" },
    { key: "optimization_targets", label: "optimization targets", sect: "III" },
    { key: "success_criteria", label: "success criteria", sect: "IV" },
    { key: "out_of_scope", label: "out of scope", sect: "V" },
    { key: "assumptions", label: "assumptions", sect: "VI" },
    { key: "nfrs", label: "nfrs", sect: "VII" },
    { key: "existing_context", label: "existing context", sect: "VIII" }
];
export function SpecPanel({ spec }) {
    return (_jsxs("section", { className: "panel", style: { padding: 10 }, children: [_jsx("div", { className: "mono", style: { color: "var(--tx2)", fontSize: 10, marginBottom: 8 }, children: "SPEC DOC" }), fields.map((field) => {
                const value = spec?.[field.key];
                const text = typeof value === "string" ? value.trim() : "";
                return (_jsxs("div", { style: { marginBottom: 10 }, children: [_jsxs("div", { className: "mono", style: { color: "var(--bdr-hi)", fontSize: 10 }, children: ["Section ", field.sect, " \u00B7 ", field.label] }), _jsx("div", { style: { fontSize: 12, color: text ? "var(--tx1)" : "var(--tx3)", fontStyle: text ? "normal" : "italic", whiteSpace: "pre-wrap" }, children: text || "- empty -" })] }, String(field.key)));
            })] }));
}
