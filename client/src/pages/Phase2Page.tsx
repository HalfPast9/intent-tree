import { useMemo, useState } from "react";
import { useIsMutating, useQueries } from "@tanstack/react-query";

import type { DisplayState, NodeView } from "@/api/types";
import { apiFetch } from "@/api/client";
import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/phase2/Sidebar";
import { LayerTree } from "@/components/phase2/LayerTree";
import { EventStream } from "@/components/phase2/EventStream";
import { RightPanel } from "@/components/phase2/RightPanel";
import { DagCanvas } from "@/components/phase2/DagCanvas";
import { deriveDisplayState } from "@/utils/displayState";
import { useCurrentStep } from "@/hooks/useCurrentStep";
import { useLayerNodes, useSession, useSpec, useStack } from "@/hooks/query";

function buildDisplayStateMap(nodes: NodeView[], timeline: any[]): Record<string, DisplayState> {
  const eventsByNode: Record<string, any[]> = {};

  for (const event of timeline) {
    const ids = Array.isArray(event.node_ids) ? event.node_ids : [];
    for (const id of ids) {
      if (!eventsByNode[id]) eventsByNode[id] = [];
      eventsByNode[id].push(event);
    }
  }

  return Object.fromEntries(nodes.map((node) => [node.id, deriveDisplayState(node, eventsByNode[node.id] ?? [])]));
}

export function Phase2Page() {
  const [sidebarMode, setSidebarMode] = useState<"tree" | "events">("tree");
  const [activeTab, setActiveTab] = useState<"step" | "node" | "spec">("step");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ id: string; source: string; target: string; interface: string; direction: string } | null>(null);

  const sessionQ = useSession();
  const stackQ = useStack();
  const specQ = useSpec();
  const session = sessionQ.data?.session ?? null;
  const depth = session?.current_depth ?? 0;

  const stepQ = useCurrentStep(session?.id ?? null, depth);
  const mutatingCount = useIsMutating();

  // Current layer nodes — poll during validation
  const currentNodesQ = useLayerNodes(depth, stepQ.step === "validation");
  const currentNodes = currentNodesQ.data?.nodes ?? [];
  const timeline = stepQ.timeline.data?.timeline ?? [];

  // Compute which past depths to also fetch (all completed before current depth)
  const stackLayers = stackQ.data?.stack?.layers ?? [];
  const pastDepths = useMemo(() => {
    const past: number[] = [];
    for (let d = 0; d < depth; d += 1) past.push(d);
    return past;
  }, [depth]);

  // Fetch nodes for all past (completed) depths in parallel
  const pastNodeQueries = useQueries({
    queries: pastDepths.map((d) => ({
      queryKey: ["layer-nodes", d] as const,
      queryFn: () => apiFetch<{ nodes: NodeView[] }>(`/phase2/layer/${d}/nodes`),
      staleTime: 5 * 60 * 1000
    }))
  });

  // Merge all nodes into groupedNodes
  const groupedNodes = useMemo(() => {
    const groups: Record<number, NodeView[]> = {};

    // Past depths from completed layers
    pastDepths.forEach((d, idx) => {
      groups[d] = pastNodeQueries[idx]?.data?.nodes ?? [];
    });

    // Current depth
    groups[depth] = currentNodes;

    // Ensure all stack layers have an entry
    stackLayers.forEach((_, idx) => {
      if (!(idx in groups)) groups[idx] = [];
    });

    return groups;
  }, [depth, currentNodes, pastDepths, pastNodeQueries, stackLayers]);

  // Build display states for all nodes
  const allNodes = useMemo(() => Object.values(groupedNodes).flat(), [groupedNodes]);
  const displayStates = useMemo(() => buildDisplayStateMap(allNodes, timeline), [allNodes, timeline]);

  const selectedNode = allNodes.find((n) => n.id === selectedNodeId) ?? null;
  const allStates = currentNodes.map((n) => displayStates[n.id] ?? "pending");

  return (
    <>
      <Header phase="phase 2" label={`layer ${depth} · ${stepQ.status === "deriving" ? "..." : (stepQ.step ?? "idle")}`} llmBusy={mutatingCount > 0} states={allStates} />
      <main className="main layout-phase2">
        <Sidebar mode={sidebarMode} setMode={setSidebarMode}>
          {sidebarMode === "tree" ? (
            <LayerTree
              stackLayers={stackLayers}
              groupedNodes={groupedNodes}
              displayStates={displayStates}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                setSelectedEdge(null);
                setActiveTab("node");
              }}
            />
          ) : (
            <EventStream events={timeline} />
          )}
        </Sidebar>

        <DagCanvas
          groupedNodes={groupedNodes}
          displayStates={displayStates}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdge?.id ?? null}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
            if (id) setActiveTab("node");
          }}
          onSelectEdge={(edge) => {
            setSelectedEdge(edge);
            if (edge) setActiveTab("node");
          }}
        />

        <RightPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          depth={depth}
          step={stepQ.step}
          stepStatus={stepQ.status}
          nodes={currentNodes}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          displayStates={displayStates}
          spec={specQ.data?.spec ?? null}
          definition={stepQ.layerDefinition.data?.definition ?? null}
          timeline={timeline}
          onDiagnosed={() => setActiveTab("step")}
        />
      </main>
    </>
  );
}
