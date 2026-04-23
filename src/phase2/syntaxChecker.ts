import { ArchNode } from "../models/archNode.js";
import { ArchEdge } from "../models/archEdge.js";

export interface SyntaxError {
  rule: string;
  message: string;
  node_ids: string[];
}

export interface SyntaxCheckResult {
  passed: boolean;
  errors: SyntaxError[];
}

export function runSyntaxCheck(
  nodes: ArchNode[],
  edges: ArchEdge[],
  allNodes: ArchNode[]
): SyntaxCheckResult {
  const errors: SyntaxError[] = [];

  // Rule 1: No cycles in vertical decomposition (node cannot be its own ancestor)
  // Build parent->child adjacency from allNodes, then check for cycles.
  const childrenMap = new Map<string, string[]>();
  for (const node of allNodes) {
    for (const parentId of node.parents) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(node.id);
    }
  }

  for (const node of nodes) {
    const visited = new Set<string>();
    const stack = [node.id];
    let cycleFound = false;

    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = childrenMap.get(current) ?? [];

      for (const child of children) {
        if (child === node.id && current !== node.id) {
          cycleFound = true;
          break;
        }

        if (!visited.has(child)) {
          visited.add(child);
          stack.push(child);
        }
      }

      if (cycleFound) break;
    }

    if (cycleFound) {
      errors.push({
        rule: "no_vertical_cycles",
        message: `Node ${node.id} is its own ancestor (vertical cycle detected).`,
        node_ids: [node.id]
      });
    }
  }

  // Rule 2: Cycles and bidirectional edges are valid within a horizontal level (no check).

  // Rule 3: No edges between nodes at different depths.
  const nodeDepthMap = new Map<string, number>();
  for (const node of allNodes) {
    nodeDepthMap.set(node.id, node.depth);
  }

  for (const edge of edges) {
    const srcDepth = nodeDepthMap.get(edge.source);
    const tgtDepth = nodeDepthMap.get(edge.target);

    if (srcDepth !== undefined && tgtDepth !== undefined && srcDepth !== tgtDepth) {
      errors.push({
        rule: "no_cross_layer_edges",
        message: `Edge ${edge.id} connects nodes at different depths: ${edge.source} (depth ${srcDepth}) and ${edge.target} (depth ${tgtDepth}).`,
        node_ids: [edge.source, edge.target]
      });
    }
  }

  // Rule 4: No orphaned nodes (except depth 0 root).
  for (const node of nodes) {
    if (node.depth > 0 && node.parents.length === 0) {
      errors.push({
        rule: "no_orphaned_nodes",
        message: `Node ${node.id} has no parents (orphaned).`,
        node_ids: [node.id]
      });
    }
  }

  // Rule 5: All edges reference valid source and target node IDs.
  const allNodeIds = new Set(allNodes.map((node) => node.id));
  for (const edge of edges) {
    const invalid: string[] = [];

    if (!allNodeIds.has(edge.source)) invalid.push(`source "${edge.source}"`);
    if (!allNodeIds.has(edge.target)) invalid.push(`target "${edge.target}"`);

    if (invalid.length > 0) {
      errors.push({
        rule: "edges_reference_valid_nodes",
        message: `Edge ${edge.id} references invalid node IDs: ${invalid.join(", ")}.`,
        node_ids: [edge.source, edge.target].filter((id) => !allNodeIds.has(id))
      });
    }
  }

  // Rule 6: No two sibling nodes have identical intents.
  const nodesByParent = new Map<string, ArchNode[]>();
  for (const node of nodes) {
    for (const parentId of node.parents) {
      if (!nodesByParent.has(parentId)) nodesByParent.set(parentId, []);
      nodesByParent.get(parentId)!.push(node);
    }
  }

  const rootNodes = nodes.filter((node) => node.depth === 0);
  if (rootNodes.length > 0) {
    nodesByParent.set("root", rootNodes);
  }

  for (const [parentId, siblings] of nodesByParent) {
    for (let i = 0; i < siblings.length; i += 1) {
      for (let j = i + 1; j < siblings.length; j += 1) {
        if (siblings[i].intent === siblings[j].intent) {
          errors.push({
            rule: "no_duplicate_sibling_intents",
            message: `Nodes ${siblings[i].id} and ${siblings[j].id} (siblings under ${parentId}) have identical intents.`,
            node_ids: [siblings[i].id, siblings[j].id]
          });
        }
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors
  };
}
