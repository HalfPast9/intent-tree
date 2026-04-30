import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useApproveNodes } from "@/hooks/mutation/useApproveNodes";
import { useProposeNodes } from "@/hooks/mutation/useProposeNodes";
import { useToast } from "@/components/shared/Toast";
export function StepNodeProposals({ depth, nodes }) {
    const propose = useProposeNodes();
    const approve = useApproveNodes();
    const { pushToast } = useToast();
    const proposeNow = async () => {
        try {
            await propose.mutateAsync({ depth });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Failed to propose nodes", "error");
        }
    };
    const approveNow = async () => {
        try {
            await approve.mutateAsync({ depth });
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Failed to approve nodes", "error");
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)", marginBottom: 8 }, children: ["NODE PROPOSALS \u00B7 L", depth] }), nodes.length === 0 ? (_jsx("button", { className: "btn btn-pri", onClick: () => void proposeNow(), children: "propose nodes" })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: "grid", gap: 6, maxHeight: 320, overflow: "auto" }, children: nodes.map((node) => (_jsxs("div", { className: "panel", style: { padding: 8, background: "var(--s2)" }, children: [_jsx("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: node.id }), _jsx("div", { style: { fontSize: 12 }, children: node.intent }), _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", marginTop: 4 }, children: node.checklist.join(" · ") })] }, node.id))) }), _jsx("button", { className: "btn btn-pri", style: { marginTop: 8 }, onClick: () => void approveNow(), children: "approve all" })] }))] }));
}
