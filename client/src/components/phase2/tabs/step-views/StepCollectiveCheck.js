import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useCollectiveCheck } from "@/hooks/mutation/useCollectiveCheck";
import { useReproposeParent } from "@/hooks/mutation/useReproposeParent";
import { useApproveRepropose } from "@/hooks/mutation/useApproveRepropose";
import { useToast } from "@/components/shared/Toast";
export function StepCollectiveCheck({ depth, parentIds }) {
    const collective = useCollectiveCheck();
    const repropose = useReproposeParent();
    const approve = useApproveRepropose();
    const { pushToast } = useToast();
    const [coverage, setCoverage] = useState(null);
    const [queued, setQueued] = useState(new Set());
    const run = async () => {
        try {
            const data = await collective.mutateAsync({ depth });
            const raw = data.coverage;
            if (Array.isArray(raw))
                setCoverage(raw);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Collective check failed", "error");
        }
    };
    const handleRepropose = async (parentId) => {
        try {
            await repropose.mutateAsync({ depth, parentId });
            setQueued((prev) => new Set(prev).add(parentId));
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Re-propose failed", "error");
        }
    };
    const handleApprove = async () => {
        try {
            await approve.mutateAsync({ depth });
            setQueued(new Set());
            setCoverage(null);
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Approve re-proposals failed", "error");
        }
    };
    const gapParents = coverage ? coverage.filter((c) => !c.covered).map((c) => c.parent_id) : [];
    return (_jsxs("div", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: ["COLLECTIVE CHECK \u00B7 L", depth] }), !coverage && (_jsxs("button", { className: "btn", onClick: () => void run(), disabled: collective.isPending, children: [collective.isPending && _jsx(Spinner, {}), "run collective check"] })), coverage && (_jsxs("div", { style: { display: "grid", gap: 6 }, children: [coverage.map((item) => (_jsxs("div", { className: "panel", style: { padding: 8, background: "var(--s2)", borderColor: item.covered ? "var(--bdr)" : "var(--proposed)" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { className: "mono", style: { fontSize: 10 }, children: item.parent_id }), _jsx("span", { className: "mono", style: { fontSize: 10, color: item.covered ? "var(--passed)" : "var(--failed)" }, children: item.covered ? "✓ covered" : "✕ gap" })] }), !item.covered && item.gap && _jsx("div", { style: { fontSize: 11, color: "var(--tx2)", marginTop: 4 }, children: item.gap })] }, item.parent_id))), gapParents.length > 0 && (_jsxs("div", { style: { display: "grid", gap: 6, marginTop: 4 }, children: [gapParents.map((id) => (_jsx("button", { className: "btn", disabled: queued.has(id) || repropose.isPending, onClick: () => void handleRepropose(id), children: queued.has(id) ? "✓ queued" : `re-propose for ${id}` }, id))), queued.size > 0 && (_jsxs("button", { className: "btn btn-pri", onClick: () => void handleApprove(), disabled: approve.isPending, children: [approve.isPending && _jsx(Spinner, {}), "approve re-proposals"] }))] })), gapParents.length === 0 && (_jsx("div", { style: { fontSize: 11, color: "var(--passed)" }, children: "\u2713 All parents covered \u2014 no gaps detected." })), _jsx("button", { className: "btn", onClick: () => void run(), disabled: collective.isPending, children: collective.isPending ? _jsxs(_Fragment, { children: [_jsx(Spinner, {}), "working\u2026"] }) : "re-run collective check" })] }))] }));
}
