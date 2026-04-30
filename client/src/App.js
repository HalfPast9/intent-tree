import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Phase1Page } from "@/pages/Phase1Page";
import { Phase2Page } from "@/pages/Phase2Page";
import { useSession } from "@/hooks/query/useSession";
import { ToastProvider } from "@/components/shared/Toast";
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 5 * 60 * 1000
        }
    }
});
function AppRoutes() {
    const sessionQ = useSession();
    const phase = sessionQ.data?.session?.current_phase ?? "phase1";
    const isPhase2 = phase === "phase2" || phase === "phase3";
    if (sessionQ.isLoading) {
        return _jsx("div", { style: { height: "100%", display: "grid", placeItems: "center", color: "var(--tx2)" }, children: "Loading..." });
    }
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: isPhase2 ? _jsx(Navigate, { to: "/phase2", replace: true }) : _jsx(Phase1Page, {}) }), _jsx(Route, { path: "/phase2", element: isPhase2 ? _jsx(Phase2Page, {}) : _jsx(Navigate, { to: "/", replace: true }) })] }));
}
export function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(ToastProvider, { children: _jsx(BrowserRouter, { children: _jsx(AppRoutes, {}) }) }) }));
}
