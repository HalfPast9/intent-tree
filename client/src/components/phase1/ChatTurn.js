import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ChatTurn({ role, text }) {
    const isSys = role === "sys";
    return (_jsxs("div", { style: {
            border: isSys ? "none" : "1px solid var(--bdr)",
            background: isSys ? "transparent" : "var(--s2)",
            borderColor: role === "you" ? "var(--acc)" : "var(--bdr)",
            borderRadius: 4,
            padding: "8px 10px",
            marginBottom: 8
        }, children: [_jsx("div", { className: "mono", style: { fontSize: 9, color: role === "you" ? "var(--acc)" : isSys ? "var(--tx3)" : "var(--tx2)", textTransform: "uppercase" }, children: role }), _jsx("div", { style: { fontSize: 12, whiteSpace: "pre-wrap" }, children: text })] }));
}
