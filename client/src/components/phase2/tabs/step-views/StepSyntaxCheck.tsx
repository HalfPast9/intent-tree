import { useState } from "react";
import { Spinner } from "@/components/shared/Spinner";
import { useSyntaxCheck } from "@/hooks/mutation/useSyntaxCheck";
import { useToast } from "@/components/shared/Toast";

export function StepSyntaxCheck({ depth }: { depth: number }) {
  const syntax = useSyntaxCheck();
  const { pushToast } = useToast();
  const [errors, setErrors] = useState<string[] | null>(null);

  const run = async () => {
    try {
      const data = await syntax.mutateAsync({ depth });
      const raw = (data as { errors?: unknown }).errors;
      setErrors(Array.isArray(raw) ? (raw as string[]) : []);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Syntax check failed", "error");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx2)" }}>SYNTAX CHECK · L{depth}</div>

      {errors === null && (
        <button className="btn" onClick={() => void run()} disabled={syntax.isPending}>
          {syntax.isPending && <Spinner />}run syntax check
        </button>
      )}

      {errors !== null && (
        <div>
          {errors.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--passed)" }}>✓ No structural errors. Auto-locking layer...</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {errors.map((err, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--failed)" }}>✕</span>
                  <span style={{ fontSize: 11 }}>{err}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--tx2)" }}>{errors.length} structural error(s) — fix nodes, then re-run.</div>
              <button className="btn" onClick={() => void run()} disabled={syntax.isPending}>
                {syntax.isPending && <Spinner />}re-run syntax check
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
