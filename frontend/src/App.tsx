import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Application } from "@application-pal/shared";
import { useUiStore } from "./lib/store";
import { api } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Rail } from "./components/Rail";
import { BoardPage } from "./pages/BoardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TimelinePage } from "./pages/TimelinePage";
import { ProfilePage } from "./pages/ProfilePage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { RecoveryPage } from "./pages/RecoveryPage";

function MainApp() {
  const { theme, accent, density } = useUiStore();
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data)
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accent);
    document.body.setAttribute("data-density", density);
  }, [theme, accent, density]);

  return (
    <div className="app-shell">
      <Rail applications={applications} />
      <div className="app-main">
        <Routes>
          <Route path="/"          element={<BoardPage />} />
          <Route path="/calendar"  element={<CalendarPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
          <Route path="/timeline"  element={<TimelinePage />} />
          <Route path="/profile"   element={<ProfilePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function SetupGuard() {
  // Check if first-run setup is needed; redirect to /setup if no account exists
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login"    element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/setup"    element={user ? <Navigate to="/" replace /> : <SetupPage />} />
      <Route path="/recovery" element={<RecoveryPage />} />
      <Route path="*" element={
        <ProtectedRoute>
          <MainApp />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export function App() {
  const { theme, accent, density } = useUiStore();
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accent);
    document.body.setAttribute("data-density", density);
  }, [theme, accent, density]);

  return (
    <AuthProvider>
      <SetupGuard />
    </AuthProvider>
  );
}
