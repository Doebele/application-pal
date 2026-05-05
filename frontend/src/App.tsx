import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { Link, Route, Routes } from "react-router-dom";
import { api } from "./lib/api";
import { useUiStore } from "./lib/store";

const queryClient = new QueryClient();

type HealthPayload = {
  status: "ok";
  timestamp: string;
};

function HomePage() {
  const darkMode = useUiStore((state) => state.darkMode);
  const toggleDarkMode = useUiStore((state) => state.toggleDarkMode);

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await api.get<HealthPayload>("/health");
      return response.data;
    }
  });

  return (
    <main className={`min-h-screen px-6 py-10 ${darkMode ? "dark" : ""}`}>
      <section className="mx-auto max-w-2xl rounded-xl border border-black/10 bg-surface p-8 shadow-sm dark:border-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Application-Pal</h1>
          <button
            type="button"
            className="rounded-md border border-black/15 p-2 dark:border-white/20"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <p className="text-muted">Swiss-inspired starter shell for Job-Pal.</p>
        <div className="mt-6 rounded-lg bg-bg p-4 text-sm">
          <strong>Backend status:</strong>{" "}
          {healthQuery.isLoading && "checking..."}
          {healthQuery.isError && "unreachable"}
          {healthQuery.data && `${healthQuery.data.status} at ${healthQuery.data.timestamp}`}
        </div>
        <Link to="/about" className="mt-6 inline-block text-accent underline">
          About
        </Link>
      </section>
    </main>
  );
}

function AboutPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto max-w-2xl rounded-xl border border-black/10 bg-surface p-8 shadow-sm">
        <h2 className="text-2xl font-semibold">Phase 1 Scaffold</h2>
        <p className="mt-3 text-muted">Frontend, backend and shared package are wired and ready.</p>
        <Link to="/" className="mt-6 inline-block text-accent underline">
          Back
        </Link>
      </section>
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
