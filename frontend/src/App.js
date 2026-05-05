import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { Link, Route, Routes } from "react-router-dom";
import { api } from "./lib/api";
import { useUiStore } from "./lib/store";
const queryClient = new QueryClient();
function HomePage() {
    const darkMode = useUiStore((state) => state.darkMode);
    const toggleDarkMode = useUiStore((state) => state.toggleDarkMode);
    const healthQuery = useQuery({
        queryKey: ["health"],
        queryFn: async () => {
            const response = await api.get("/health");
            return response.data;
        }
    });
    return (_jsx("main", { className: `min-h-screen px-6 py-10 ${darkMode ? "dark" : ""}`, children: _jsxs("section", { className: "mx-auto max-w-2xl rounded-xl border border-black/10 bg-surface p-8 shadow-sm dark:border-white/10", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h1", { className: "text-3xl font-semibold", children: "Application-Pal" }), _jsx("button", { type: "button", className: "rounded-md border border-black/15 p-2 dark:border-white/20", onClick: toggleDarkMode, "aria-label": "Toggle dark mode", children: darkMode ? _jsx(Sun, { size: 18 }) : _jsx(Moon, { size: 18 }) })] }), _jsx("p", { className: "text-muted", children: "Swiss-inspired starter shell for Job-Pal." }), _jsxs("div", { className: "mt-6 rounded-lg bg-bg p-4 text-sm", children: [_jsx("strong", { children: "Backend status:" }), " ", healthQuery.isLoading && "checking...", healthQuery.isError && "unreachable", healthQuery.data && `${healthQuery.data.status} at ${healthQuery.data.timestamp}`] }), _jsx(Link, { to: "/about", className: "mt-6 inline-block text-accent underline", children: "About" })] }) }));
}
function AboutPage() {
    return (_jsx("main", { className: "min-h-screen px-6 py-10", children: _jsxs("section", { className: "mx-auto max-w-2xl rounded-xl border border-black/10 bg-surface p-8 shadow-sm", children: [_jsx("h2", { className: "text-2xl font-semibold", children: "Phase 1 Scaffold" }), _jsx("p", { className: "mt-3 text-muted", children: "Frontend, backend and shared package are wired and ready." }), _jsx(Link, { to: "/", className: "mt-6 inline-block text-accent underline", children: "Back" })] }) }));
}
export function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomePage, {}) }), _jsx(Route, { path: "/about", element: _jsx(AboutPage, {}) })] }) }));
}
