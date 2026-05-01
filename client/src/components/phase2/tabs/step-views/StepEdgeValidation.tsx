import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useEdgeValidation } from "@/hooks/mutation/useEdgeValidation";
import { useToast } from "@/components/shared/Toast";

type EdgeResult = {
  source: string;
  target: string;
  passed: boolean;
  issues: Array<{ type: string; description: string }>;
};

type MissingEdge = {
  source: string;
  target: string;
  rationale: string;
  suggested_interface: string;
  suggested_direction: string;
};

type EdgeValidationData = {
  passed: boolean;
  edge_results: EdgeResult[];
  missing_edges: MissingEdge[];
};

export function StepEdgeValidation({ depth }: { depth: number }) {
  const edgeValidation = useEdgeValidation();
  const { pushToast } = useToast();
  const [result, setResult] = useState<EdgeValidationData | null>(null);

  const run = async () => {
    try {
      const data = await edgeValidation.mutateAsync({ depth });
      setResult(data as EdgeValidationData);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Edge validation failed", "error");
    }
  };

  const failedEdges = result ? result.edge_results.filter((e) => !e.passed) : [];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>EDGE VALIDATION · L{depth}</div>

      {!result && (
        <button className="btn" onClick={() => void run()} disabled={edgeValidation.isPending}>
          {edgeValidation.isPending && <Spinner />}run edge validation
        </button>
      )}

      {result && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, color: result.passed ? "var(--passed)" : "var(--failed)" }}>
            {result.passed ? "✓ All edges valid" : `✕ ${failedEdges.length} edge(s) failed`}
          </div>

          {failedEdges.map((edge) => (
            <div key={`${edge.source}-${edge.target}`} className="panel" style={{ padding: 8, background: "var(--s2)", borderColor: "var(--failed)" }}>
              <div className="mono" style={{ fontSize: 10 }}>{edge.source} → {edge.target}</div>
              {edge.issues.map((issue, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>
                  <span className="mono" style={{ fontSize: 9, color: "var(--proposed)" }}>{issue.type}</span>{" "}
                  {issue.description}
                </div>
              ))}
            </div>
          ))}

          {result.missing_edges.length > 0 && (
            <>
              <div className="mono" style={{ fontSize: 10, color: "var(--tx2)", marginTop: 4 }}>MISSING EDGES</div>
              {result.missing_edges.map((edge) => (
                <div key={`${edge.source}-${edge.target}`} className="panel" style={{ padding: 8, background: "var(--s2)", borderColor: "var(--proposed)" }}>
                  <div className="mono" style={{ fontSize: 10 }}>{edge.source} → {edge.target}</div>
                  <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>{edge.rationale}</div>
                  <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>
                    interface: {edge.suggested_interface} · {edge.suggested_direction}
                  </div>
                </div>
              ))}
            </>
          )}

          <button className="btn" onClick={() => void run()} disabled={edgeValidation.isPending}>
            {edgeValidation.isPending ? <><Spinner />working…</> : "re-run edge validation"}
          </button>
        </div>
      )}
    </div>
  );
}
