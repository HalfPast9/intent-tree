import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { mapEventKind } from "@/utils/eventKind";
function summarizePayload(payload) {
    const keys = ["node_id", "depth", "tension", "classification", "parent_id", "error"];
    for (const key of keys) {
        if (key in payload) {
            return `${key}:${String(payload[key])}`;
        }
    }
    const [first] = Object.entries(payload);
    return first ? `${first[0]}:${String(first[1])}` : "-";
}
export function EventStream({ events }) {
    const rows = useMemo(() => [...events].slice(-120), [events]);
    return (_jsx("div", { style: { display: "grid", gap: 4 }, children: rows.map((event) => {
            const kind = mapEventKind(event.type);
            const color = kind === "ok" ? "var(--passed)" : kind === "warn" ? "var(--proposed)" : kind === "error" ? "var(--failed)" : "var(--tx2)";
            return (_jsxs("div", { className: "panel", style: { padding: "5px 6px", background: "var(--s2)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, display: "grid", gridTemplateColumns: "64px 1fr", gap: 6 }, children: [_jsx("span", { style: { color: "var(--tx3)" }, children: new Date(event.timestamp).toLocaleTimeString() }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { color }, children: event.type }), _jsx("div", { style: { color: "var(--tx3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: summarizePayload(event.payload ?? {}) })] })] }, event.id));
        }) }));
}
