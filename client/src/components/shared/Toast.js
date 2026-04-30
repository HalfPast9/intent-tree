import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
    const [items, setItems] = useState([]);
    const pushToast = useCallback((text, tone = "error") => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setItems((prev) => [...prev, { id, tone, text }]);
        window.setTimeout(() => {
            setItems((prev) => prev.filter((it) => it.id !== id));
        }, 5000);
    }, []);
    const value = useMemo(() => ({ pushToast }), [pushToast]);
    return (_jsxs(ToastContext.Provider, { value: value, children: [children, _jsx("div", { style: { position: "fixed", top: 56, right: 16, zIndex: 1000, display: "grid", gap: 8 }, children: items.map((item) => (_jsx("div", { className: "panel", style: {
                        minWidth: 260,
                        padding: "10px 12px",
                        borderColor: item.tone === "error" ? "var(--failed)" : "var(--bdr-hi)",
                        background: item.tone === "error" ? "var(--bg-failed)" : "var(--s1)",
                        fontSize: 12
                    }, children: item.text }, item.id))) })] }));
}
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error("useToast must be used inside ToastProvider");
    }
    return ctx;
}
