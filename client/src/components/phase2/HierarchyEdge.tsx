import { BaseEdge, getSmoothStepPath, type EdgeProps } from "reactflow";

export function HierarchyEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath(props);
  return <BaseEdge id={props.id} path={path} style={{ stroke: "var(--bdr-hi)", strokeWidth: 1.5, pointerEvents: "none" }} />;
}
