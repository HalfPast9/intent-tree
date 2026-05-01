import type { NodeView } from "@/api/types";
import { Spinner } from "@/components/shared/Spinner";
import { useApproveNodes } from "@/hooks/mutation/useApproveNodes";
import { useProposeNodes } from "@/hooks/mutation/useProposeNodes";
import { useToast } from "@/components/shared/Toast";

export function StepNodeProposals({
  depth,
  nodes,
  proposed,
  onProposed
}: {
  depth: number;
  nodes: NodeView[];
  proposed: NodeView[];
  onProposed: (nodes: NodeView[]) => void;
}) {
  const propose = useProposeNodes();
  const approve = useApproveNodes();
  const { pushToast } = useToast();

  const displayNodes = nodes.length > 0 ? nodes : proposed;

  const proposeNow = async () => {
    try {
      const result = await propose.mutateAsync({ depth });
      onProposed(result.nodes ?? []);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to propose nodes", "error");
    }
  };

  const approveNow = async () => {
    try {
      await approve.mutateAsync({ depth });
      onProposed([]);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to approve nodes", "error");
    }
  };

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 8 }}>NODE PROPOSALS · L{depth}</div>
      {displayNodes.length === 0 ? (
        <button className="btn btn-pri" onClick={() => void proposeNow()} disabled={propose.isPending}>
          {propose.isPending && <Spinner />}propose nodes
        </button>
      ) : (
        <>
          <div style={{ display: "grid", gap: 6, maxHeight: 320, overflow: "auto" }}>
            {displayNodes.map((node) => (
              <div key={node.id} className="panel" style={{ padding: 8, background: "var(--s2)" }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>{node.id}</div>
                <div style={{ fontSize: 12 }}>{node.intent}</div>
                <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 4 }}>{node.checklist.join(" · ")}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-pri" style={{ marginTop: 8 }} onClick={() => void approveNow()} disabled={approve.isPending}>
            {approve.isPending && <Spinner />}approve all
          </button>
        </>
      )}
    </div>
  );
}
