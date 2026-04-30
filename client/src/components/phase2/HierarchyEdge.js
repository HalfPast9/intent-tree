import { jsx as _jsx } from "react/jsx-runtime";
import { BaseEdge, getSmoothStepPath } from "reactflow";
export function HierarchyEdge(props) {
    const [path] = getSmoothStepPath(props);
    return _jsx(BaseEdge, { id: props.id, path: path, style: { stroke: "var(--bdr-hi)", strokeWidth: 1.5, pointerEvents: "none" } });
}
