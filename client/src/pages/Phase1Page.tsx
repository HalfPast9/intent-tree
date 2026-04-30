import { useMemo, useState } from "react";

import type { ConflictItem, ProblemSpec } from "@/api/types";
import { useSpec } from "@/hooks/query/useSpec";
import { Header } from "@/components/shared/Header";
import { ChatPanel } from "@/components/phase1/ChatPanel";
import { SpecPanel } from "@/components/phase1/SpecPanel";
import { ActionBar } from "@/components/phase1/ActionBar";

type SpecTextKey = Exclude<keyof ProblemSpec, "id" | "locked">;

const specKeys: SpecTextKey[] = [
  "problem_statement",
  "hard_constraints",
  "optimization_targets",
  "success_criteria",
  "out_of_scope",
  "assumptions",
  "nfrs",
  "existing_context"
];

export function Phase1Page() {
  const specQ = useSpec();
  const [liveSpec, setLiveSpec] = useState<ProblemSpec | null>(null);
  const [clean, setClean] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [llmBusy, setLlmBusy] = useState(false);

  const spec = liveSpec ?? (specQ.data?.spec ?? null);

  const filledCount = useMemo(
    () =>
      specKeys.filter((k) => {
        const value = spec?.[k];
        return typeof value === "string" && value.trim().length > 0;
      }).length,
    [spec]
  );

  const onSpecUpdate = (nextSpec: Record<string, unknown> | null, nextClean: boolean, nextConflicts: unknown[]) => {
    if (nextSpec) {
      setLiveSpec(nextSpec as ProblemSpec);
    }
    setClean(nextClean);
    setConflicts(nextConflicts as ConflictItem[]);
  };

  return (
    <>
      <Header phase="phase 1" label={`${filledCount}/8`} llmBusy={false} />
      <main className="main layout-phase1">
        <div className="phase1-col">
          <ChatPanel onSpecUpdate={onSpecUpdate} onBusy={setLlmBusy} />
        </div>
        <div className="phase1-col">
          <SpecPanel spec={spec} />
          {conflicts.length > 0 && (
            <div style={{ position: "relative", marginTop: 10 }}>
              <div
                className="panel"
                style={{
                  padding: 10,
                  borderColor: "var(--proposed)",
                  background: "var(--bg-proposed)",
                  opacity: llmBusy && filledCount === 8 ? 0.35 : 1,
                  filter: llmBusy && filledCount === 8 ? "blur(1.5px)" : "none",
                  pointerEvents: llmBusy && filledCount === 8 ? "none" : "auto",
                  transition: "opacity 0.2s, filter 0.2s"
                }}
              >
                <div className="mono" style={{ color: "var(--proposed)", fontSize: 10, marginBottom: 6 }}>CONFLICTS</div>
                {conflicts.map((c, idx) => (
                  <div key={`${c.tension}-${idx}`} style={{ fontSize: 12, marginBottom: 8 }}>
                    <div className="mono" style={{ color: "var(--tx2)", fontSize: 10 }}>{c.fields.join(", ")}</div>
                    <div>{c.tension}</div>
                    <div style={{ color: "var(--tx2)" }}>{c.question}</div>
                  </div>
                ))}
              </div>
              {llmBusy && filledCount === 8 && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8
                }}>
                  <span className="pulse" style={{ width: 6, height: 6, flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>conflict check running...</span>
                </div>
              )}
            </div>
          )}
          <ActionBar
            allFilled={filledCount === 8}
            clean={clean}
            onConflict={(nextClean, nextConflicts) => {
              setClean(nextClean);
              setConflicts(nextConflicts as ConflictItem[]);
            }}
          />
        </div>
      </main>
    </>
  );
}
