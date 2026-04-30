import dagre from "@dagrejs/dagre";
export function computeDagreLayout(nodes, edges) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", ranksep: 180, nodesep: 40 });
    nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 80 }));
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    return nodes.map((n) => {
        const p = g.node(n.id);
        return {
            ...n,
            position: { x: p.x - 100, y: p.y - 40 }
        };
    });
}
