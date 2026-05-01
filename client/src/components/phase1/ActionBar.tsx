import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Spinner } from "@/components/shared/Spinner";
import { useConflictCheck } from "@/hooks/mutation/useConflictCheck";
import { useLockPhase1 } from "@/hooks/mutation/useLockPhase1";
import { useToast } from "@/components/shared/Toast";

type ActionBarProps = {
  allFilled: boolean;
  clean: boolean;
  onConflict: (clean: boolean, conflicts: unknown[]) => void;
};

export function ActionBar({ allFilled, clean, onConflict }: ActionBarProps) {
  const conflictCheck = useConflictCheck();
  const lockPhase1 = useLockPhase1();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const onRunConflict = async () => {
    try {
      const data = await conflictCheck.mutateAsync(undefined);
      onConflict(Boolean((data as { clean?: boolean }).clean), ((data as { conflicts?: unknown[] }).conflicts ?? []));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Conflict check failed", "error");
    }
  };

  const onLock = async () => {
    try {
      await lockPhase1.mutateAsync(undefined);
      await queryClient.refetchQueries({ queryKey: ["session"] });
      pushToast("Phase 1 locked — entering Phase 2", "info");
      navigate("/phase2");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Phase 1 lock failed", "error");
    }
  };

  return (
    <div className="panel" style={{ marginTop: 10, padding: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <button className="btn" disabled={!allFilled || conflictCheck.isPending} onClick={() => void onRunConflict()}>
        {conflictCheck.isPending ? <Spinner /> : "run conflict check"}
      </button>
      <button className="btn btn-pri" disabled={!clean || lockPhase1.isPending} onClick={() => void onLock()}>
        {lockPhase1.isPending ? <Spinner /> : "lock phase 1"}
      </button>
    </div>
  );
}
