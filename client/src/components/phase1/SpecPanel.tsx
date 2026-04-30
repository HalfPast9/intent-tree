import type { ProblemSpec } from "@/api/types";

const fields: Array<{ key: keyof ProblemSpec; label: string; sect: string }> = [
  { key: "problem_statement", label: "problem statement", sect: "I" },
  { key: "hard_constraints", label: "hard constraints", sect: "II" },
  { key: "optimization_targets", label: "optimization targets", sect: "III" },
  { key: "success_criteria", label: "success criteria", sect: "IV" },
  { key: "out_of_scope", label: "out of scope", sect: "V" },
  { key: "assumptions", label: "assumptions", sect: "VI" },
  { key: "nfrs", label: "nfrs", sect: "VII" },
  { key: "existing_context", label: "existing context", sect: "VIII" }
];

export function SpecPanel({ spec }: { spec: ProblemSpec | null }) {
  return (
    <section className="panel" style={{ padding: 10 }}>
      <div className="mono" style={{ color: "var(--tx2)", fontSize: 10, marginBottom: 8 }}>SPEC DOC</div>
      {fields.map((field) => {
        const value = spec?.[field.key];
        const text = typeof value === "string" ? value.trim() : "";
        return (
          <div key={String(field.key)} style={{ marginBottom: 10 }}>
            <div className="mono" style={{ color: "var(--bdr-hi)", fontSize: 10 }}>
              Section {field.sect} · {field.label}
            </div>
            <div style={{ fontSize: 12, color: text ? "var(--tx1)" : "var(--tx3)", fontStyle: text ? "normal" : "italic", whiteSpace: "pre-wrap" }}>
              {text || "- empty -"}
            </div>
          </div>
        );
      })}
    </section>
  );
}
