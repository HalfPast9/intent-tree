import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo } from "react";
import ReactFlow, { Background, Controls, MiniMap, useEdgesState, useNodesState } from "reactflow";
import { computeDagreLayout } from "@/utils/dagre";
import { NodeCard } from "@/components/phase2/NodeCard";
import { HierarchyEdge } from "@/components/phase2/HierarchyEdge";
import { SiblingEdge } from "@/components/phase2/SiblingEdge";
export function DagCanvas({ groupedNodes, displayStates, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge }) {
    const graph = useMemo(() => {
        const nodes = [];
        const edges = [];
        const seenSibling = new Set();
        for (const [depthRaw, depthNodes] of Object.entries(groupedNodes)) {
            const depth = Number(depthRaw);
            depthNodes.forEach((node, idx) => {
                nodes.push({
                    id: node.id,
                    type: "nodeCard",
                    position: { x: depth * 280, y: idx * 120 },
                    data: {
                        id: node.id,
                        intent: node.intent,
                        inputs: node.inputs,
                        outputs: node.outputs,
                        leaf: node.leaf,
                        state: displayStates[node.id] ?? "pending"
                    },
                    selected: node.id === selectedNodeId
                });
                for (const parent of node.parents) {
                    edges.push({
                        id: `h-${parent}-${node.id}`,
                        source: parent,
                        target: node.id,
                        type: "hierarchy"
                    });
                }
                node.edges.forEach((edge) => {
                    const key = [node.id, edge.target].sort().join("::");
                    if (seenSibling.has(key))
                        return;
                    seenSibling.add(key);
                    edges.push({
                        id: `s-${edge.id}`,
                        source: node.id,
                        target: edge.target,
                        type: "sibling",
                        label: edge.interface,
                        data: { interface: edge.interface, direction: edge.direction },
                        selected: `s-${edge.id}` === selectedEdgeId
                    });
                });
            });
        }
        return { nodes: computeDagreLayout(nodes, edges), edges };
    }, [groupedNodes, displayStates, selectedNodeId, selectedEdgeId]);
    const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
    useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes]);
    useEffect(() => setEdges(graph.edges), [graph.edges, setEdges]);
    return (_jsx("div", { style: { background: "var(--bg)", borderLeft: "1px solid var(--bdr)", borderRight: "1px solid var(--bdr)", height: "100%" }, children: _jsxs(ReactFlow, { style: { height: "100%" }, nodes: nodes, edges: edges, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onNodeClick: (_e, n) => {
                onSelectEdge(null);
                onSelectNode(n.id);
            }, onEdgeClick: (_e, e) => {
                onSelectNode(null);
                onSelectEdge({
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    interface: String(e.data?.interface ?? e.label ?? ""),
                    direction: String(e.data?.direction ?? "directed")
                });
            }, onPaneClick: () => {
                onSelectNode(null);
                onSelectEdge(null);
            }, fitView: true, minZoom: 0.3, maxZoom: 1.5, nodeTypes: { nodeCard: NodeCard }, edgeTypes: { hierarchy: HierarchyEdge, sibling: SiblingEdge }, children: [_jsx(Background, { color: "var(--bdr)", gap: 18, size: 1 }), _jsx(MiniMap, { style: { background: "var(--s1)" } }), _jsx(Controls, {})] }) }));
}
