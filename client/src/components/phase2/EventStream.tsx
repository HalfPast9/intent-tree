import { useMemo } from "react";

import type { EventRecord } from "@/api/types";
import { mapEventKind } from "@/utils/eventKind";

function summarizePayload(payload: Record<string, unknown>) {
  const keys = ["node_id", "depth", "tension", "classification", "parent_id", "error"];
  for (const key of keys) {
    if (key in payload) {
      return `${key}:${String(payload[key])}`;
    }
  }
  const [first] = Object.entries(payload);
  return first ? `${first[0]}:${String(first[1])}` : "-";
}

export function EventStream({ events }: { events: EventRecord[] }) {
  const rows = useMemo(() => [...events].slice(-120), [events]);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {rows.map((event) => {
        const kind = mapEventKind(event.type);
        const color = kind === "ok" ? "var(--passed)" : kind === "warn" ? "var(--proposed)" : kind === "error" ? "var(--failed)" : "var(--tx2)";

        return (
          <div key={event.id} className="panel" style={{ padding: "5px 6px", background: "var(--s2)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, display: "grid", gridTemplateColumns: "64px 1fr", gap: 6 }}>
            <span style={{ color: "var(--tx3)" }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color }}>{event.type}</div>
              <div style={{ color: "var(--tx3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summarizePayload(typeof event.payload === "string" ? (JSON.parse(event.payload) as Record<string, unknown>) : (event.payload ?? {}))}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
