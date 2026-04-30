import type { DisplayState } from "@/api/types";

type HeaderProps = {
  phase: "phase 1" | "phase 2";
  label: string;
  llmBusy: boolean;
  states?: DisplayState[];
};

export function Header({ phase, label, llmBusy, states = [] }: HeaderProps) {
  const proposed = states.filter((s) => s === "proposed").length;
  const failed = states.filter((s) => s === "failed").length;

  return (
    <header className="hdr">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--acc)", display: "inline-block" }} />
        <span className="mono" style={{ color: "var(--acc)", fontSize: 12 }}>
          intent tree
        </span>
        <span className="mono" style={{ color: "var(--tx2)", fontSize: 11 }}>
          {phase} · {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {states.length > 0 && <span className="badge">nodes {states.length}</span>}
        {proposed > 0 && <span className="badge" style={{ borderColor: "var(--proposed)", color: "var(--proposed)" }}>proposed {proposed}</span>}
        {failed > 0 && <span className="badge" style={{ borderColor: "var(--failed)", color: "var(--failed)" }}>failed {failed}</span>}
        {llmBusy && <span className="pulse" />}
      </div>
    </header>
  );
}
