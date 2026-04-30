type ChatTurnProps = {
  role: "you" | "agent" | "sys";
  text: string;
};

export function ChatTurn({ role, text }: ChatTurnProps) {
  const isSys = role === "sys";
  return (
    <div
      style={{
        border: isSys ? "none" : "1px solid var(--bdr)",
        background: isSys ? "transparent" : "var(--s2)",
        borderColor: role === "you" ? "var(--acc)" : "var(--bdr)",
        borderRadius: 4,
        padding: "8px 10px",
        marginBottom: 8
      }}
    >
      <div className="mono" style={{ fontSize: 9, color: role === "you" ? "var(--acc)" : isSys ? "var(--tx3)" : "var(--tx2)", textTransform: "uppercase" }}>
        {role}
      </div>
      <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}
