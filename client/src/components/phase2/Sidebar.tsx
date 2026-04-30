import type { Dispatch, ReactNode, SetStateAction } from "react";

type SidebarProps = {
  mode: "tree" | "events";
  setMode: Dispatch<SetStateAction<"tree" | "events">>;
  children: ReactNode;
};

export function Sidebar({ mode, setMode, children }: SidebarProps) {
  return (
    <aside className="panel" style={{ borderRadius: 0, borderLeft: "none", borderTop: "none", borderBottom: "none", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 4, padding: 8, borderBottom: "1px solid var(--bdr)" }}>
        <button className={`btn ${mode === "tree" ? "btn-pri" : "btn-ghost"}`} onClick={() => setMode("tree")}>tree</button>
        <button className={`btn ${mode === "events" ? "btn-pri" : "btn-ghost"}`} onClick={() => setMode("events")}>events</button>
      </div>
      <div style={{ minHeight: 0, overflow: "auto", padding: 8 }}>{children}</div>
    </aside>
  );
}
