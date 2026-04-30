import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
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
export function StepTab({ depth, step, status, nodes, states, definition }) {
    const [exitCheck, setExitCheck] = useState(null);
    const [diagnosis, setDiagnosis] = useState(null);
    const [diagnosing, setDiagnosing] = useState(null);
    const diagnoseNode = useDiagnoseNode();
    const { pushToast } = useToast();
    // Fetch exit-check when layer locks
    useEffect(() => {
        if (step === "locked") {
            void apiFetch("/phase2/exit-check")
                .then(setExitCheck)
                .catch(() => setExitCheck(null));
        }
    }, [step]);
    // Reset diagnosis when step changes away from validation
    useEffect(() => {
        if (step !== "validation")
            setDiagnosis(null);
    }, [step]);
    const handleDiagnose = async (nodeId) => {
        setDiagnosing(nodeId);
        try {
            const data = await diagnoseNode.mutateAsync({ nodeId });
            setDiagnosis({ nodeId, result: data });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Diagnosis failed", "error");
        }
        finally {
            setDiagnosing(null);
        }
    };
    if (status === "deriving") {
        return _jsx("div", { style: { fontSize: 12, color: "var(--tx2)" }, children: "Loading layer state..." });
    }
    if (step === "phase2 complete")
        return _jsx(StepPhase2Complete, {});
    if (step === "idle")
        return _jsx(StepIdle, {});
    if (step === "layer definition")
        return _jsx(StepLayerDefinition, { depth: depth, definition: definition });
    if (step === "node proposals")
        return _jsx(StepNodeProposals, { depth: depth, nodes: nodes });
    if (step === "validation") {
        if (diagnosis) {
            return (_jsx(StepDiagnosis, { nodeId: diagnosis.nodeId, result: diagnosis.result, onDone: () => setDiagnosis(null) }));
        }
        return _jsx(StepValidation, { nodes: nodes, states: states, onDiagnose: (id) => void handleDiagnose(id), diagnosing: diagnosing });
    }
    if (step === "collective check") {
        const parentIds = Array.from(new Set(nodes.flatMap((n) => n.parents)));
        return _jsx(StepCollectiveCheck, { depth: depth, parentIds: parentIds });
    }
    if (step === "syntax check")
        return _jsx(StepSyntaxCheck, { depth: depth });
    if (step === "leaf determination")
        return _jsx(StepLeafDetermination, { depth: depth, nodes: nodes });
    if (step === "locked")
        return _jsx(StepLayerComplete, { depth: depth, exit: exitCheck });
    return _jsx("div", { style: { fontSize: 12, color: "var(--tx2)" }, children: "No step available." });
}
