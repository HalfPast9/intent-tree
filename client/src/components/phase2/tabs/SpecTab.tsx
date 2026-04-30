import type { ProblemSpec } from "@/api/types";

const fields: Array<{ key: keyof ProblemSpec; label: string }> = [
  { key: "problem_statement", label: "problem statement" },
  { key: "hard_constraints", label: "hard constraints" },
  { key: "optimization_targets", label: "optimization targets" },
  { key: "success_criteria", label: "success criteria" },
  { key: "out_of_scope", label: "out of scope" },
  { key: "assumptions", label: "assumptions" },
  { key: "nfrs", label: "nfrs" },
  { key: "existing_context", label: "existing context" }
];

export function SpecTab({ spec }: { spec: ProblemSpec | null }) {
  return (
    <div>
      <div className="mono" style={{ color: "var(--tx2)", fontSize: 10, marginBottom: 8 }}>PHASE 1 SPEC</div>
      {fields.map((field, idx) => (
        (() => {
          const rawValue = spec?.[field.key];
          const text = typeof rawValue === "string" ? rawValue.trim() : "";
          return (
            <div key={field.key} style={{ marginBottom: 8 }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--bdr-hi)" }}>Section {idx + 1} · {field.label}</div>
              <div style={{ fontSize: 12, color: "var(--tx1)", whiteSpace: "pre-wrap" }}>{text || "- empty -"}</div>
            </div>
          );
        })()
      ))}
    </div>
  );
}
