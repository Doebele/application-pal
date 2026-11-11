import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Application } from "@application-pal/shared";
import { useUiStore } from "./lib/store";
import { api } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth";
import { SettingsSync } from "./lib/settingsSync";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Rail } from "./components/Rail";
import { BoardPage } from "./pages/BoardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TimelinePage } from "./pages/TimelinePage";
import { ProfilePage } from "./pages/ProfilePage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { LetterCoachPage } from "./pages/LetterCoachPage";
import { LinkedInCheckPage } from "./pages/LinkedInCheckPage";
import { CvCheckPage } from "./pages/CvCheckPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { TablePage } from "./pages/TablePage";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { RecoveryPage } from "./pages/RecoveryPage";

function MainApp() {
  const { theme, accent, density, uiLanguage, setUiLanguage } = useUiStore();
  const { i18n } = useTranslation();
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data)
  });

  // Sync language from server profile on first load
  useQuery({
    queryKey: ["profile-lang"],
    queryFn: async () => {
      const r = await api.get<{ uiLanguage?: string }>("/api/profile");
      const lang = (r.data.uiLanguage as "de" | "en" | "fr") ?? uiLanguage;
      if (lang !== uiLanguage) setUiLanguage(lang);
      if (lang !== i18n.language) await i18n.changeLanguage(lang);
      return lang;
    },
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accent);
    document.body.setAttribute("data-density", density);
  }, [theme, accent, density]);

  // Once a day on app start: summarize new documents and re-summarize ones changed in Drive.
  // Triggered here because the AI config only lives in the browser; the server skips the run
  // if the profile already records one today (docSummaryRunAt), across all devices.
  const { ai } = useUiStore();
  useEffect(() => {
    if (ai.provider === "none") return;
    api.post("/api/documents/summarize", { ai, daily: true }).catch(() => {});
  }, [ai.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const { user } = useAuth();
  return (
    <div className="app-shell">
      {user?.id && <SettingsSync key={user.id} userId={user.id} />}
      <Rail applications={applications} />
      <div className="app-main">
        <Routes>
          <Route path="/"          element={<BoardPage />} />
          <Route path="/table"     element={<TablePage />} />
          <Route path="/calendar"  element={<CalendarPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
          <Route path="/timeline"  element={<TimelinePage />} />
          <Route path="/profile"   element={<ProfilePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/cv-check"      element={<CvCheckPage />} />
          <Route path="/letter-coach"  element={<LetterCoachPage />} />
          <Route path="/linkedin"      element={<LinkedInCheckPage />} />
          <Route path="/knowledge"     element={<KnowledgeBasePage />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
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
