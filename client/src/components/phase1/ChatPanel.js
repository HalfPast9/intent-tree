import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatTurn } from "@/components/phase1/ChatTurn";
import { useToast } from "@/components/shared/Toast";
function ThinkingTurn({ tokens, status, done }) {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { style: { margin: "8px 0" }, children: [_jsxs("button", { onClick: () => setExpanded((v) => !v), style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 0",
                    color: "var(--tx3)",
                    fontSize: 11,
                    fontFamily: "inherit"
                }, children: [_jsx("span", { style: { fontSize: 10 }, children: expanded ? "▼" : "▶" }), done
                        ? _jsx("span", { className: "mono", children: "thinking complete" })
                        : status
                            ? _jsx("span", { className: "mono", style: { color: "var(--acc)" }, children: status })
                            : (_jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { className: "mono", style: { color: "var(--acc)" }, children: "thinking" }), _jsx("span", { className: "pulse", style: { width: 6, height: 6, display: "inline-block" } })] }))] }), expanded && (_jsxs("div", { style: {
                    background: "var(--s1)",
                    border: "1px solid var(--bdr)",
                    borderLeft: "2px solid var(--bdr-hi)",
                    borderRadius: 4,
                    padding: "8px 10px",
                    maxHeight: 260,
                    overflow: "auto",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    color: "var(--tx2)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    lineHeight: 1.5
                }, children: [tokens || _jsx("span", { style: { opacity: 0.5 }, children: "waiting for tokens..." }), !done && _jsx("span", { style: { opacity: 0.6, animation: "blink 1s step-end infinite" }, children: "\u258C" })] }))] }));
}
export function ChatPanel({ onSpecUpdate, onBusy }) {
    const [message, setMessage] = useState("");
    const [turns, setTurns] = useState([]);
    const [inFlight, setInFlight] = useState(false);
    const boxRef = useRef(null);
    const { pushToast } = useToast();
    useEffect(() => {
        boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
    }, [turns]);
    const canSend = useMemo(() => message.trim().length > 0 && !inFlight, [message, inFlight]);
    const onSend = async () => {
        const trimmed = message.trim();
        if (!trimmed || inFlight)
            return;
        setMessage("");
        setInFlight(true);
        onBusy?.(true);
        // Append user turn + thinking placeholder
        setTurns((prev) => [
            ...prev,
            { role: "you", text: trimmed },
            { role: "thinking", tokens: "", status: null, done: false }
        ]);
        try {
            const response = await fetch("/api/phase1/message/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: trimmed })
            });
            if (!response.ok || !response.body) {
                throw new Error(`Request failed: ${response.status}`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            const updateThinking = (patch) => {
                setTurns((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "thinking") {
                        next[next.length - 1] = { ...last, ...patch };
                    }
                    return next;
                });
            };
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data: "))
                        continue;
                    let event;
                    try {
                        event = JSON.parse(line.slice(6));
                    }
                    catch {
                        continue;
                    }
                    if (event.type === "token") {
                        updateThinking({ tokens: undefined }); // trigger setter
                        setTurns((prev) => {
                            const next = [...prev];
                            const last = next[next.length - 1];
                            if (last?.role === "thinking") {
                                next[next.length - 1] = { ...last, tokens: last.tokens + String(event.token ?? "") };
                            }
                            return next;
                        });
                    }
                    else if (event.type === "status") {
                        updateThinking({ status: String(event.text ?? "") });
                    }
                    else if (event.type === "done") {
                        const agentMessage = String(event.message ?? "Updated.");
                        const spec = event.spec ?? null;
                        const clean = Boolean(event.clean);
                        const conflicts = event.conflicts ?? [];
                        // Replace thinking turn with agent response
                        setTurns((prev) => {
                            const withoutThinking = prev.filter((t) => t.role !== "thinking");
                            return [
                                ...withoutThinking,
                                { role: "agent", text: agentMessage },
                                ...(conflicts.length > 0
                                    ? [{ role: "sys", text: `conflict check · ${conflicts.length} tension(s)` }]
                                    : [])
                            ];
                        });
                        onSpecUpdate(spec, clean, conflicts);
                    }
                    else if (event.type === "error") {
                        const msg = String(event.message ?? "An error occurred.");
                        setTurns((prev) => prev.filter((t) => t.role !== "thinking").concat({ role: "sys", text: msg }));
                        pushToast(msg, "error");
                    }
                }
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : "Failed to send message";
            setTurns((prev) => prev.filter((t) => t.role !== "thinking").concat({ role: "sys", text: msg }));
            pushToast(msg, "error");
        }
        finally {
            setInFlight(false);
            onBusy?.(false);
        }
    };
    return (_jsxs("section", { className: "panel", style: { padding: 10, display: "flex", flexDirection: "column", height: "100%" }, children: [_jsx("div", { className: "mono", style: { color: "var(--tx2)", fontSize: 10, marginBottom: 8 }, children: "CHAT" }), _jsx("div", { ref: boxRef, style: { overflow: "auto", minHeight: 0, flex: 1, paddingRight: 4 }, children: turns.map((turn, idx) => turn.role === "thinking" ? (_jsx(ThinkingTurn, { tokens: turn.tokens, status: turn.status, done: turn.done }, idx)) : (_jsx(ChatTurn, { role: turn.role, text: turn.text }, idx))) }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 8 }, children: [_jsx("input", { value: message, onChange: (e) => setMessage(e.target.value), onKeyDown: (e) => e.key === "Enter" && void onSend(), disabled: inFlight, placeholder: "message", style: { flex: 1, background: "var(--s2)", border: "1px solid var(--bdr)", color: "var(--tx1)", padding: "8px 10px", borderRadius: 4 } }), _jsx("button", { className: "btn btn-pri", disabled: !canSend, onClick: () => void onSend(), children: "send" })] })] }));
}
