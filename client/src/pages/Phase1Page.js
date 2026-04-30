import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useSpec } from "@/hooks/query/useSpec";
import { Header } from "@/components/shared/Header";
import { ChatPanel } from "@/components/phase1/ChatPanel";
import { SpecPanel } from "@/components/phase1/SpecPanel";
import { ActionBar } from "@/components/phase1/ActionBar";
const specKeys = [
    "problem_statement",
    "hard_constraints",
    "optimization_targets",
    "success_criteria",
    "out_of_scope",
    "assumptions",
    "nfrs",
    "existing_context"
];
export function Phase1Page() {
    const specQ = useSpec();
    const [liveSpec, setLiveSpec] = useState(null);
    const [clean, setClean] = useState(false);
    const [conflicts, setConflicts] = useState([]);
    const [llmBusy, setLlmBusy] = useState(false);
    const spec = liveSpec ?? (specQ.data?.spec ?? null);
    const filledCount = useMemo(() => specKeys.filter((k) => {
        const value = spec?.[k];
        return typeof value === "string" && value.trim().length > 0;
    }).length, [spec]);
    const onSpecUpdate = (nextSpec, nextClean, nextConflicts) => {
        if (nextSpec) {
            setLiveSpec(nextSpec);
        }
        setClean(nextClean);
        setConflicts(nextConflicts);
    };
    return (_jsxs(_Fragment, { children: [_jsx(Header, { phase: "phase 1", label: `${filledCount}/8`, llmBusy: false }), _jsxs("main", { className: "main layout-phase1", children: [_jsx("div", { className: "phase1-col", children: _jsx(ChatPanel, { onSpecUpdate: onSpecUpdate, onBusy: setLlmBusy }) }), _jsxs("div", { className: "phase1-col", children: [_jsx(SpecPanel, { spec: spec }), conflicts.length > 0 && (_jsxs("div", { style: { position: "relative", marginTop: 10 }, children: [_jsxs("div", { className: "panel", style: {
                                            padding: 10,
                                            borderColor: "var(--proposed)",
                                            background: "var(--bg-proposed)",
                                            opacity: llmBusy && filledCount === 8 ? 0.35 : 1,
                                            filter: llmBusy && filledCount === 8 ? "blur(1.5px)" : "none",
                                            pointerEvents: llmBusy && filledCount === 8 ? "none" : "auto",
                                            transition: "opacity 0.2s, filter 0.2s"
                                        }, children: [_jsx("div", { className: "mono", style: { color: "var(--proposed)", fontSize: 10, marginBottom: 6 }, children: "CONFLICTS" }), conflicts.map((c, idx) => (_jsxs("div", { style: { fontSize: 12, marginBottom: 8 }, children: [_jsx("div", { className: "mono", style: { color: "var(--tx2)", fontSize: 10 }, children: c.fields.join(", ") }), _jsx("div", { children: c.tension }), _jsx("div", { style: { color: "var(--tx2)" }, children: c.question })] }, `${c.tension}-${idx}`)))] }), llmBusy && filledCount === 8 && (_jsxs("div", { style: {
                                            position: "absolute",
                                            inset: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            gap: 8
                                        }, children: [_jsx("span", { className: "pulse", style: { width: 6, height: 6, flexShrink: 0 } }), _jsx("span", { className: "mono", style: { fontSize: 10, color: "var(--tx2)" }, children: "conflict check running..." })] }))] })), _jsx(ActionBar, { allFilled: filledCount === 8, clean: clean, onConflict: (nextClean, nextConflicts) => {
                                    setClean(nextClean);
                                    setConflicts(nextConflicts);
                                } })] })] })] }));
}
