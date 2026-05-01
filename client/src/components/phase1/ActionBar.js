import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/shared/Spinner";
import { useConflictCheck } from "@/hooks/mutation/useConflictCheck";
import { useLockPhase1 } from "@/hooks/mutation/useLockPhase1";
import { useToast } from "@/components/shared/Toast";
export function ActionBar({ allFilled, clean, onConflict }) {
    const conflictCheck = useConflictCheck();
    const lockPhase1 = useLockPhase1();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { pushToast } = useToast();
    const onRunConflict = async () => {
        try {
            const data = await conflictCheck.mutateAsync(undefined);
            onConflict(Boolean(data.clean), (data.conflicts ?? []));
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Conflict check failed", "error");
        }
    };
    const onLock = async () => {
        try {
            await lockPhase1.mutateAsync(undefined);
            await queryClient.refetchQueries({ queryKey: ["session"] });
            pushToast("Phase 1 locked — entering Phase 2", "info");
            navigate("/phase2");
        }
        catch (error) {
            pushToast(error instanceof Error ? error.message : "Phase 1 lock failed", "error");
        }
    };
    return (_jsxs("div", { className: "panel", style: { marginTop: 10, padding: 10, display: "flex", justifyContent: "flex-end", gap: 8 }, children: [_jsxs("button", { className: "btn", disabled: !allFilled || conflictCheck.isPending, onClick: () => void onRunConflict(), children: [conflictCheck.isPending && _jsx(Spinner, {}), "run conflict check"] }), _jsxs("button", { className: "btn btn-pri", disabled: !clean || lockPhase1.isPending, onClick: () => void onLock(), children: [lockPhase1.isPending && _jsx(Spinner, {}), "lock phase 1"] })] }));
}
