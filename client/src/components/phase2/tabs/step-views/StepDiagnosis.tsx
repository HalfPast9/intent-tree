import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import type { DiagnosisResult } from "@/api/types";
import { useConfirmDiagnosis } from "@/hooks/mutation/useConfirmDiagnosis";
import { useRewriteNode } from "@/hooks/mutation/useRewriteNode";
import { useTraverseUpward } from "@/hooks/mutation/useTraverseUpward";
import { useToast } from "@/components/shared/Toast";

type Props = {
  nodeId: string;
  result: DiagnosisResult;
  onDone: () => void;
};

export function StepDiagnosis({ nodeId, result, onDone }: Props) {
  const [classification, setClassification] = useState<"implementation" | "design">(result.classification);
  const [confirmed, setConfirmed] = useState(false);
  const confirmDiag = useConfirmDiagnosis();
  const rewrite = useRewriteNode();
  const traverse = useTraverseUpward();
  const { pushToast } = useToast();

  const onConfirm = async () => {
    try {
      const body: Record<string, unknown> =
        classification !== result.classification ? { classification } : {};
      if (classification === "design" && result.origin_nodes.length > 0) {
        body.origin_nodes = result.origin_nodes;
      }
      await confirmDiag.mutateAsync({ nodeId, body });
      setConfirmed(true);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Confirm failed", "error");
    }
  };

  const onRewrite = async () => {
    try {
      await rewrite.mutateAsync({ nodeId });
      onDone();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Rewrite failed", "error");
    }
  };

  const onTraverse = async () => {
    try {
      await traverse.mutateAsync({ origin_nodes: result.origin_nodes });
      onDone();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Traversal failed", "error");
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>FAILURE DIAGNOSIS</div>

      <div>
        <div className="mono" style={{ fontSize: 10, color: "var(--tx3)" }}>NODE</div>
        <div className="mono" style={{ fontSize: 11 }}>{nodeId}</div>
      </div>

      {result.suggested_action && (
        <div>
          <div className="mono" style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 2 }}>SUGGESTED ACTION</div>
          <div style={{ fontSize: 11, color: "var(--tx2)" }}>{result.suggested_action}</div>
        </div>
      )}

      <div>
        <div className="mono" style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 4 }}>CLASSIFICATION</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["implementation", "design"] as const).map((cls) => (
            <button
              key={cls}
              className="btn"
              disabled={confirmed}
              onClick={() => setClassification(cls)}
              style={{ borderColor: classification === cls ? "var(--acc)" : "var(--bdr)", color: classification === cls ? "var(--acc)" : "var(--tx2)" }}
            >
              {classification === cls ? "●" : "○"} {cls}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 2 }}>REASONING</div>
        <div style={{ fontSize: 11, color: "var(--tx2)", whiteSpace: "pre-wrap" }}>{result.reasoning}</div>
      </div>

      {!confirmed && (
        <button className="btn btn-pri" onClick={() => void onConfirm()} disabled={confirmDiag.isPending}>
          {confirmDiag.isPending ? <Spinner /> : "confirm"}
        </button>
      )}

      {confirmed && classification === "implementation" && (
        <div>
          <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 8 }}>Implementation error confirmed. Rewrite node based on failed checklist items.</div>
          <button className="btn btn-pri" onClick={() => void onRewrite()} disabled={rewrite.isPending}>
            {rewrite.isPending ? <Spinner /> : "rewrite node"}
          </button>
        </div>
      )}

      {confirmed && classification === "design" && result.origin_nodes.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 4 }}>ORIGIN NODES</div>
          {result.origin_nodes.map((id) => (
            <div key={id} className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>· {id}</div>
          ))}
          <div style={{ fontSize: 11, color: "var(--tx2)", margin: "8px 0" }}>Design error confirmed. Trigger upward traversal to invalidate origin nodes.</div>
          <button className="btn btn-pri" onClick={() => void onTraverse()} disabled={traverse.isPending} style={{ borderColor: "var(--failed)", color: "var(--failed)", background: "var(--bg-failed)" }}>
            {traverse.isPending ? <Spinner /> : "trigger upward traversal"}
          </button>
        </div>
      )}
    </div>
  );
}
