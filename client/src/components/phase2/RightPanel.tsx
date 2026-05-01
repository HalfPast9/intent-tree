import type { DisplayState, NodeView, ProblemSpec } from "@/api/types";
import type { StepName } from "@/hooks/useCurrentStep";
import { NodeTab } from "@/components/phase2/tabs/NodeTab";
import { SpecTab } from "@/components/phase2/tabs/SpecTab";
import { StepTab } from "@/components/phase2/tabs/StepTab";

type RightPanelProps = {
  activeTab: "step" | "node" | "spec";
  setActiveTab: (tab: "step" | "node" | "spec") => void;
  depth: number;
  step: StepName | null;
  stepStatus: "ready" | "deriving";
  nodes: NodeView[];
  selectedNode: NodeView | null;
  selectedEdge: { id: string; source: string; target: string; interface: string; direction: string } | null;
  displayStates: Record<string, DisplayState>;
  spec: ProblemSpec | null;
  definition: any;
  timeline: any[];
  onDiagnosed: () => void;
};

export function RightPanel(props: RightPanelProps) {
  const tabButton = (id: "step" | "node" | "spec", label: string) => (
    <button
      className="btn btn-ghost"
      onClick={() => props.setActiveTab(id)}
      style={{
        border: "none",
        borderBottom: props.activeTab === id ? "2px solid var(--acc)" : "2px solid transparent",
        borderRadius: 0,
        padding: "8px 10px",
        minWidth: 0,
        flex: 1
      }}
    >
      {label}
    </button>
  );

  return (
    <aside className="panel" style={{ borderRadius: 0, borderRight: "none", borderTop: "none", borderBottom: "none", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 34, borderBottom: "1px solid var(--bdr)", display: "flex", alignItems: "center" }}>
        {tabButton("step", "Step")}
        {tabButton("node", "Node")}
        {tabButton("spec", "Spec")}
      </div>
      <div style={{ minHeight: 0, overflow: "auto", padding: 10 }}>
        {props.activeTab === "step" && (
          <StepTab
            depth={props.depth}
            step={props.step}
            status={props.stepStatus}
            nodes={props.nodes}
            states={props.displayStates}
            definition={props.definition}
            timeline={props.timeline}
          />
        )}
        {props.activeTab === "node" && (
          <NodeTab
            node={props.selectedNode}
            edge={props.selectedEdge}
            state={props.selectedNode ? props.displayStates[props.selectedNode.id] ?? null : null}
            depth={props.depth}
            onDiagnosed={props.onDiagnosed}
          />
        )}
        {props.activeTab === "spec" && <SpecTab spec={props.spec} />}
      </div>
    </aside>
  );
}
