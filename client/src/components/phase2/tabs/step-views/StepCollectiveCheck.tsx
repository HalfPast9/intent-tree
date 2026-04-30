import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useCollectiveCheck } from "@/hooks/mutation/useCollectiveCheck";
import { useReproposeParent } from "@/hooks/mutation/useReproposeParent";
import { useApproveRepropose } from "@/hooks/mutation/useApproveRepropose";
import { useToast } from "@/components/shared/Toast";

type CoverageItem = {
  parent_id: string;
  covered: boolean;
  gap?: string;
};

export function StepCollectiveCheck({ depth, parentIds }: { depth: number; parentIds: string[] }) {
  const collective = useCollectiveCheck();
  const repropose = useReproposeParent();
  const approve = useApproveRepropose();
  const { pushToast } = useToast();
  const [coverage, setCoverage] = useState<CoverageItem[] | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());

  const run = async () => {
    try {
      const data = await collective.mutateAsync({ depth });
      const raw = (data as { coverage?: unknown }).coverage;
      if (Array.isArray(raw)) setCoverage(raw as CoverageItem[]);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Collective check failed", "error");
    }
  };

  const handleRepropose = async (parentId: string) => {
    try {
      await repropose.mutateAsync({ depth, parentId });
      setQueued((prev) => new Set(prev).add(parentId));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Re-propose failed", "error");
    }
  };

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ depth });
      setQueued(new Set());
      setCoverage(null);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Approve re-proposals failed", "error");
    }
  };

  const gapParents = coverage ? coverage.filter((c) => !c.covered).map((c) => c.parent_id) : [];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>COLLECTIVE CHECK · L{depth}</div>

      {!coverage && (
        <button className="btn" onClick={() => void run()} disabled={collective.isPending}>
          {collective.isPending ? <Spinner /> : "run collective check"}
        </button>
      )}

      {coverage && (
        <div style={{ display: "grid", gap: 6 }}>
          {coverage.map((item) => (
            <div key={item.parent_id} className="panel" style={{ padding: 8, background: "var(--s2)", borderColor: item.covered ? "var(--bdr)" : "var(--proposed)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: 10 }}>{item.parent_id}</span>
                <span className="mono" style={{ fontSize: 10, color: item.covered ? "var(--passed)" : "var(--failed)" }}>{item.covered ? "✓ covered" : "✕ gap"}</span>
              </div>
              {!item.covered && item.gap && <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 4 }}>{item.gap}</div>}
            </div>
          ))}

          {gapParents.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              {gapParents.map((id) => (
                <button
                  key={id}
                  className="btn"
                  disabled={queued.has(id) || repropose.isPending}
                  onClick={() => void handleRepropose(id)}
                >
                  {queued.has(id) ? "✓ queued" : `re-propose for ${id}`}
                </button>
              ))}
              {queued.size > 0 && (
                <button className="btn btn-pri" onClick={() => void handleApprove()} disabled={approve.isPending}>
                  {approve.isPending ? <Spinner /> : "approve re-proposals"}
                </button>
              )}
            </div>
          )}

          {gapParents.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--passed)" }}>✓ All parents covered — no gaps detected.</div>
          )}

          <button className="btn" onClick={() => void run()} disabled={collective.isPending}>
            {collective.isPending ? <Spinner /> : "re-run collective check"}
          </button>
        </div>
      )}
    </div>
  );
}
