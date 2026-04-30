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
    return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--tx2)" }}>Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/" element={isPhase2 ? <Navigate to="/phase2" replace /> : <Phase1Page />} />
      <Route path="/phase2" element={isPhase2 ? <Phase2Page /> : <Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
