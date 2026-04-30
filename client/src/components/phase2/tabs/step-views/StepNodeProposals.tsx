import type { NodeView } from "@/api/types";
import { useApproveNodes } from "@/hooks/mutation/useApproveNodes";
import { useProposeNodes } from "@/hooks/mutation/useProposeNodes";
import { useToast } from "@/components/shared/Toast";

export function StepNodeProposals({ depth, nodes }: { depth: number; nodes: NodeView[] }) {
  const propose = useProposeNodes();
  const approve = useApproveNodes();
  const { pushToast } = useToast();

  const proposeNow = async () => {
    try {
      await propose.mutateAsync({ depth });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to propose nodes", "error");
    }
  };

  const approveNow = async () => {
    try {
      await approve.mutateAsync({ depth });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to approve nodes", "error");
    }
  };

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 8 }}>NODE PROPOSALS · L{depth}</div>
      {nodes.length === 0 ? (
        <button className="btn btn-pri" onClick={() => void proposeNow()}>propose nodes</button>
      ) : (
        <>
          <div style={{ display: "grid", gap: 6, maxHeight: 320, overflow: "auto" }}>
            {nodes.map((node) => (
              <div key={node.id} className="panel" style={{ padding: 8, background: "var(--s2)" }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>{node.id}</div>
                <div style={{ fontSize: 12 }}>{node.intent}</div>
                <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 4 }}>{node.checklist.join(" · ")}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void approveNow()}>approve all</button>
        </>
      )}
    </div>
  );
}
