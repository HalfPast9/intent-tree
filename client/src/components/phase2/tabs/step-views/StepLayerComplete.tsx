import type { ExitCheckResult } from "@/api/types";
import { Spinner } from "@/components/shared/Spinner";
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
        <div style={{ fontSize: 12, color: "var(--passed)", marginTop: 8 }}>All nodes are leaves or have been decomposed. Ready to lock.</div>
        <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void lockPhase2.mutateAsync(undefined)} disabled={lockPhase2.isPending}>
          {lockPhase2.isPending && <Spinner />}lock phase 2
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>LAYER COMPLETE · L{depth}</div>
      <div style={{ fontSize: 12, marginTop: 8 }}>Next layer will decompose:</div>
      <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
        {exit.decompose_further_ids.map((id) => (
          <div key={id} className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>· {id}</div>
        ))}
      </div>
      <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void generate.mutateAsync({ depth: depth + 1 })} disabled={generate.isPending}>
        {generate.isPending && <Spinner />}generate L{depth + 1} definition
      </button>
    </div>
  );
}
