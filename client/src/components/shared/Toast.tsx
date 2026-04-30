import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastItem = { id: number; tone: "error" | "info"; text: string };

type ToastContextValue = {
  pushToast: (text: string, tone?: "error" | "info") => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((text: string, tone: "error" | "info" = "error") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((prev) => [...prev, { id, tone, text }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{ position: "fixed", top: 56, right: 16, zIndex: 1000, display: "grid", gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            className="panel"
            style={{
              minWidth: 260,
              padding: "10px 12px",
              borderColor: item.tone === "error" ? "var(--failed)" : "var(--bdr-hi)",
              background: item.tone === "error" ? "var(--bg-failed)" : "var(--s1)",
              fontSize: 12
            }}
          >
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return ctx;
}
