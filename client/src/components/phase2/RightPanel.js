import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NodeTab } from "@/components/phase2/tabs/NodeTab";
import { SpecTab } from "@/components/phase2/tabs/SpecTab";
import { StepTab } from "@/components/phase2/tabs/StepTab";
export function RightPanel(props) {
    const tabButton = (id, label) => (_jsx("button", { className: "btn btn-ghost", onClick: () => props.setActiveTab(id), style: {
            border: "none",
            borderBottom: props.activeTab === id ? "2px solid var(--acc)" : "2px solid transparent",
            borderRadius: 0,
            padding: "8px 10px"
        }, children: label }));
    return (_jsxs("aside", { className: "panel", style: { borderRadius: 0, borderRight: "none", borderTop: "none", borderBottom: "none", display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: { height: 34, borderBottom: "1px solid var(--bdr)", display: "flex", alignItems: "center" }, children: [tabButton("step", "Step"), tabButton("node", "Node"), tabButton("spec", "Spec")] }), _jsxs("div", { style: { minHeight: 0, overflow: "auto", padding: 10 }, children: [props.activeTab === "step" && (_jsx(StepTab, { depth: props.depth, step: props.step, status: props.stepStatus, nodes: props.nodes, states: props.displayStates, definition: props.definition, timeline: props.timeline })), props.activeTab === "node" && (_jsx(NodeTab, { node: props.selectedNode, edge: props.selectedEdge, state: props.selectedNode ? props.displayStates[props.selectedNode.id] ?? null : null, depth: props.depth, onDiagnosed: props.onDiagnosed })), props.activeTab === "spec" && _jsx(SpecTab, { spec: props.spec })] })] }));
}
