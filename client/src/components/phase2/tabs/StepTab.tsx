import { useEffect, useState } from "react";

import type { DiagnosisResult, DisplayState, ExitCheckResult, NodeView } from "@/api/types";
import type { StepName } from "@/hooks/useCurrentStep";
import { apiFetch } from "@/api/client";
import { useDiagnoseNode } from "@/hooks/mutation/useDiagnoseNode";
import { useToast } from "@/components/shared/Toast";
import { StepIdle } from "@/components/phase2/tabs/step-views/StepIdle";
import { StepLayerDefinition } from "@/components/phase2/tabs/step-views/StepLayerDefinition";
import { StepNodeProposals } from "@/components/phase2/tabs/step-views/StepNodeProposals";
import { StepValidation } from "@/components/phase2/tabs/step-views/StepValidation";
import { StepDiagnosis } from "@/components/phase2/tabs/step-views/StepDiagnosis";
import { StepCollectiveCheck } from "@/components/phase2/tabs/step-views/StepCollectiveCheck";
import { StepSyntaxCheck } from "@/components/phase2/tabs/step-views/StepSyntaxCheck";
import { StepLeafDetermination } from "@/components/phase2/tabs/step-views/StepLeafDetermination";
import { StepLayerComplete } from "@/components/phase2/tabs/step-views/StepLayerComplete";
import { StepPhase2Complete } from "@/components/phase2/tabs/step-views/StepPhase2Complete";

type StepTabProps = {
  depth: number;
  step: StepName | null;
  status: "ready" | "deriving";
  nodes: NodeView[];
  states: Record<string, DisplayState>;
  definition: any;
  timeline: any[];
};

export function StepTab({ depth, step, status, nodes, states, definition }: StepTabProps) {
  const [exitCheck, setExitCheck] = useState<ExitCheckResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<{ nodeId: string; result: DiagnosisResult } | null>(null);
  const [diagnosing, setDiagnosing] = useState<string | null>(null);
  const [proposedNodes, setProposedNodes] = useState<NodeView[]>([]);
  const diagnoseNode = useDiagnoseNode();
  const { pushToast } = useToast();

  // Fetch exit-check when layer locks
  useEffect(() => {
    if (step === "locked") {
      void apiFetch<{ complete: boolean; decompose_further_ids: string[] }>("/phase2/exit-check")
        .then(setExitCheck)
        .catch(() => setExitCheck(null));
    }
  }, [step]);

  // Reset diagnosis when step changes away from validation
  useEffect(() => {
    if (step !== "validation") setDiagnosis(null);
  }, [step]);

  // Reset proposed nodes when leaving the proposals step
  useEffect(() => {
    if (step !== "node proposals") setProposedNodes([]);
  }, [step]);

  const handleDiagnose = async (nodeId: string) => {
    setDiagnosing(nodeId);
    try {
      const data = await diagnoseNode.mutateAsync({ nodeId });
      setDiagnosis({ nodeId, result: data as DiagnosisResult });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Diagnosis failed", "error");
    } finally {
      setDiagnosing(null);
    }
  };

  if (status === "deriving") {
    return <div style={{ fontSize: 12, color: "var(--tx2)" }}>Loading layer state...</div>;
  }

  if (step === "phase2 complete") return <StepPhase2Complete />;
  if (step === "idle") return <StepIdle />;
  if (step === "layer definition") return <StepLayerDefinition depth={depth} definition={definition} />;
  if (step === "node proposals") return <StepNodeProposals depth={depth} nodes={nodes} proposed={proposedNodes} onProposed={setProposedNodes} />;
  if (step === "validation") {
    if (diagnosis) {
      return (
        <StepDiagnosis
          nodeId={diagnosis.nodeId}
          result={diagnosis.result}
          onDone={() => setDiagnosis(null)}
        />
      );
    }
    return <StepValidation depth={depth} nodes={nodes} states={states} onDiagnose={(id) => void handleDiagnose(id)} diagnosing={diagnosing} />;
  }
  if (step === "collective check") {
    const parentIds = Array.from(new Set(nodes.flatMap((n) => n.parents)));
    return <StepCollectiveCheck depth={depth} parentIds={parentIds} />;
  }
  if (step === "syntax check") return <StepSyntaxCheck depth={depth} />;
  if (step === "leaf determination") return <StepLeafDetermination depth={depth} nodes={nodes} />;
  if (step === "locked") return <StepLayerComplete depth={depth} exit={exitCheck} />;

  return <div style={{ fontSize: 12, color: "var(--tx2)" }}>No step available.</div>;
}
