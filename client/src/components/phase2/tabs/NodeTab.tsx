import { useState } from "react";

import type { DisplayState, NodeView } from "@/api/types";
import { useEditNode } from "@/hooks/mutation/useEditNode";
import { useDiagnoseNode } from "@/hooks/mutation/useDiagnoseNode";
import { useToast } from "@/components/shared/Toast";

type NodeTabProps = {
  node: NodeView | null;
  edge: { id: string; source: string; target: string; interface: string; direction: string } | null;
  state: DisplayState | null;
  depth: number;
  onDiagnosed: () => void;
};

export function NodeTab({ node, edge, state, depth, onDiagnosed }: NodeTabProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ intent: "", inputs: "", outputs: "" });
  const editNode = useEditNode();
  const diagnoseNode = useDiagnoseNode();
  const { pushToast } = useToast();

  if (!node && !edge) {
    return <div style={{ color: "var(--tx2)", fontSize: 12 }}>No node selected. Click a node or edge in the canvas.</div>;
  }

  if (edge) {
    return (
      <div>
        <div className="mono" style={{ fontSize: 11, color: "var(--tx2)" }}>
          edge · {edge.source} {"->"} {edge.target}
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <div className="mono" style={{ color: "var(--tx3)", fontSize: 10 }}>INTERFACE</div>
          <div>{edge.interface}</div>
          <div className="mono" style={{ color: "var(--tx3)", fontSize: 10, marginTop: 8 }}>DIRECTION</div>
          <div>{edge.direction}</div>
        </div>
      </div>
    );
  }

  if (!node) return null;

  const save = async () => {
    try {
      await editNode.mutateAsync({
        depth,
        nodeId: node.id,
        body: {
          intent: form.intent || undefined,
          inputs: form.inputs || undefined,
          outputs: form.outputs || undefined
        }
      });
      setEditing(false);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to edit node", "error");
    }
  };

  const diagnose = async () => {
    try {
      await diagnoseNode.mutateAsync({ nodeId: node.id });
      onDiagnosed();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to diagnose node", "error");
    }
  };

  return (
    <div>
      <div className="mono" style={{ color: "var(--tx2)", fontSize: 11 }}>{node.id}</div>
      <div style={{ fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }}>{node.intent}</div>
      <div className="mono" style={{ color: "var(--tx3)", fontSize: 10, marginTop: 8 }}>STATE</div>
      <div style={{ fontSize: 12 }}>{state ?? "pending"}</div>
      <div className="mono" style={{ color: "var(--tx3)", fontSize: 10, marginTop: 8 }}>PARENTS</div>
      <div style={{ fontSize: 12 }}>{node.parents.join(", ") || "-"}</div>
      <div className="mono" style={{ color: "var(--tx3)", fontSize: 10, marginTop: 8 }}>INPUTS</div>
      <div style={{ fontSize: 12 }}>{node.inputs || "-"}</div>
      <div className="mono" style={{ color: "var(--tx3)", fontSize: 10, marginTop: 8 }}>OUTPUTS</div>
      <div style={{ fontSize: 12 }}>{node.outputs || "-"}</div>

      {editing && (
        <div className="panel" style={{ marginTop: 8, padding: 8, display: "grid", gap: 6 }}>
          <textarea rows={3} placeholder="intent" value={form.intent} onChange={(e) => setForm((p) => ({ ...p, intent: e.target.value }))} />
          <input placeholder="inputs" value={form.inputs} onChange={(e) => setForm((p) => ({ ...p, inputs: e.target.value }))} />
          <input placeholder="outputs" value={form.outputs} onChange={(e) => setForm((p) => ({ ...p, outputs: e.target.value }))} />
          <button className="btn btn-pri" onClick={() => void save()}>save</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" onClick={() => setEditing((v) => !v)}>edit node</button>
        {state === "failed" && <button className="btn btn-pri" onClick={() => void diagnose()}>diagnose</button>}
      </div>
    </div>
  );
}
