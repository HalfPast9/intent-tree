import { useEffect, useMemo, useRef, useState } from "react";

import type { ConflictItem, ProblemSpec } from "@/api/types";
import { ChatTurn } from "@/components/phase1/ChatTurn";
import { useToast } from "@/components/shared/Toast";

type Turn =
  | { role: "you" | "agent" | "sys"; text: string }
  | { role: "thinking"; tokens: string; status: string | null; done: boolean };

type ChatPanelProps = {
  onSpecUpdate: (nextSpec: Record<string, unknown> | null, clean: boolean, conflicts: unknown[]) => void;
  onBusy?: (busy: boolean) => void;
};

function ThinkingTurn({ tokens, status, done }: { tokens: string; status: string | null; done: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ margin: "8px 0" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
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
        }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? "▼" : "▶"}</span>
        {done
          ? <span className="mono">thinking complete</span>
          : status
            ? <span className="mono" style={{ color: "var(--acc)" }}>{status}</span>
            : (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="mono" style={{ color: "var(--acc)" }}>thinking</span>
                <span className="pulse" style={{ width: 6, height: 6, display: "inline-block" }} />
              </span>
            )
        }
      </button>

      {expanded && (
        <div
          style={{
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
          }}
        >
          {tokens || <span style={{ opacity: 0.5 }}>waiting for tokens...</span>}
          {!done && <span style={{ opacity: 0.6, animation: "blink 1s step-end infinite" }}>▌</span>}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ onSpecUpdate, onBusy }: ChatPanelProps) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [inFlight, setInFlight] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [turns]);

  const canSend = useMemo(() => message.trim().length > 0 && !inFlight, [message, inFlight]);

  const onSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || inFlight) return;

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

      const updateThinking = (patch: Partial<{ tokens: string; status: string | null; done: boolean }>) => {
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
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event.type === "token") {
            updateThinking({ tokens: undefined as unknown as string }); // trigger setter
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "thinking") {
                next[next.length - 1] = { ...last, tokens: last.tokens + String(event.token ?? "") };
              }
              return next;
            });
          } else if (event.type === "status") {
            updateThinking({ status: String(event.text ?? "") });
          } else if (event.type === "done") {
            const agentMessage = String(event.message ?? "Updated.");
            const spec = (event.spec as Record<string, unknown>) ?? null;
            const clean = Boolean(event.clean);
            const conflicts = (event.conflicts as ConflictItem[]) ?? [];

            // Replace thinking turn with agent response
            setTurns((prev) => {
              const withoutThinking = prev.filter((t) => t.role !== "thinking");
              return [
                ...withoutThinking,
                { role: "agent", text: agentMessage },
                ...(conflicts.length > 0
                  ? [{ role: "sys" as const, text: `conflict check · ${conflicts.length} tension(s)` }]
                  : [])
              ];
            });

            onSpecUpdate(spec, clean, conflicts);
          } else if (event.type === "error") {
            const msg = String(event.message ?? "An error occurred.");
            setTurns((prev) => prev.filter((t) => t.role !== "thinking").concat({ role: "sys", text: msg }));
            pushToast(msg, "error");
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send message";
      setTurns((prev) => prev.filter((t) => t.role !== "thinking").concat({ role: "sys", text: msg }));
      pushToast(msg, "error");
    } finally {
      setInFlight(false);
      onBusy?.(false);
    }
  };

  return (
    <section className="panel" style={{ padding: 10, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="mono" style={{ color: "var(--tx2)", fontSize: 10, marginBottom: 8 }}>CHAT</div>
      <div ref={boxRef} style={{ overflow: "auto", minHeight: 0, flex: 1, paddingRight: 4 }}>
        {turns.map((turn, idx) =>
          turn.role === "thinking" ? (
            <ThinkingTurn key={idx} tokens={turn.tokens} status={turn.status} done={turn.done} />
          ) : (
            <ChatTurn key={idx} role={turn.role} text={turn.text} />
          )
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void onSend()}
          disabled={inFlight}
          placeholder="message"
          style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--bdr)", color: "var(--tx1)", padding: "8px 10px", borderRadius: 4 }}
        />
        <button className="btn btn-pri" disabled={!canSend} onClick={() => void onSend()}>
          send
        </button>
      </div>
    </section>
  );
}
