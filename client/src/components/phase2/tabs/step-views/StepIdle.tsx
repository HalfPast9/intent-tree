import { Spinner } from "@/components/shared/Spinner";

export function StepIdle() {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>PHASE 2</div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--tx2)", display: "flex", alignItems: "center", gap: 6 }}>
        <Spinner />Auto-locking layer — all checks passed.
      </div>
    </div>
  );
}
