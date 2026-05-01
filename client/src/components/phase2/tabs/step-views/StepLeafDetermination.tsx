import { useMemo, useState } from "react";

import type { NodeView } from "@/api/types";
import { useDetermineLeaf } from "@/hooks/mutation/useDetermineLeaf";
import { useConfirmLeaf } from "@/hooks/mutation/useConfirmLeaf";
import { useToast } from "@/components/shared/Toast";
import { Spinner } from "@/components/shared/Spinner";

export function StepLeafDetermination({ depth, nodes }: { depth: number; nodes: NodeView[] }) {
  const determine = useDetermineLeaf();
  const confirm = useConfirmLeaf();
  const { pushToast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, "leaf" | "decompose_further">>({});

  const leafReady = useMemo(() => nodes.some((n) => n.leaf !== null), [nodes]);

  const onDetermine = async () => {
    try {
      await determine.mutateAsync({ depth });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Leaf determination failed", "error");
    }
  };

  const onConfirm = async () => {
    try {
      await confirm.mutateAsync({
        depth,
        body: Object.keys(overrides).length > 0 ? { overrides } : {}
      });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Leaf confirmation failed", "error");
    }
  };

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 8 }}>LEAF DETERMINATION · L{depth}</div>
      {!leafReady && (
        <div style={{ display: "grid", gap: 8 }}>
          <button className="btn" onClick={() => void onDetermine()} disabled={determine.isPending}>
            {determine.isPending && <Spinner />}determine leaf nodes
          </button>
          {determine.isPending && (
            <div style={{ fontSize: 11, color: "var(--tx2)" }}>LLM is classifying nodes — this may take a moment...</div>
          )}
        </div>
      )}
      {leafReady && (
        <>
          <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
            {nodes.map((node) => {
              const effective = overrides[node.id] ?? node.leaf;
              return (
                <div key={node.id} className="panel" style={{ padding: 8, background: "var(--s2)" }}>
                  <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>{node.id}</div>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>{node.intent}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["leaf", "decompose_further"] as const).map((cls) => (
                      <button
                        key={cls}
                        className="btn"
                        onClick={() => setOverrides((prev) => ({ ...prev, [node.id]: cls }))}
                        style={{ borderColor: effective === cls ? "var(--acc)" : "var(--bdr)", color: effective === cls ? "var(--acc)" : "var(--tx2)" }}
                      >
                        {cls === "leaf" ? "leaf" : "decompose further"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void onConfirm()} disabled={confirm.isPending}>
            {confirm.isPending && <Spinner />}confirm
          </button>
        </>
      )}
    </div>
  );
}
