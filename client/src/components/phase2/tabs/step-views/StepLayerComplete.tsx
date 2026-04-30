import type { ExitCheckResult } from "@/api/types";
import { useGenerateDefinition } from "@/hooks/mutation/useGenerateDefinition";
import { useLockPhase2 } from "@/hooks/mutation/useLockPhase2";

export function StepLayerComplete({ depth, exit }: { depth: number; exit: ExitCheckResult | null }) {
  const generate = useGenerateDefinition();
  const lockPhase2 = useLockPhase2();

  if (!exit) return <div style={{ fontSize: 12, color: "var(--tx2)" }}>Loading exit check...</div>;

  if (exit.complete) {
    return (
      <div>
        <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>LAYER COMPLETE · L{depth}</div>
        <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void lockPhase2.mutateAsync(undefined)}>lock phase 2</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>LAYER COMPLETE · L{depth}</div>
      <div style={{ fontSize: 12, marginTop: 8 }}>Next layer will decompose:</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--tx2)" }}>{exit.decompose_further_ids.join(", ") || "-"}</div>
      <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void generate.mutateAsync({ depth: depth + 1 })}>generate next definition</button>
    </div>
  );
}
