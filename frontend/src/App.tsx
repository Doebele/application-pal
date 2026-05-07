import { Routes, Route } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Application } from "@application-pal/shared";
import { useUiStore } from "./lib/store";
import { api } from "./lib/api";
import { Rail } from "./components/Rail";
import { BoardPage } from "./pages/BoardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TimelinePage } from "./pages/TimelinePage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  const { theme, accent, density } = useUiStore();

  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data)
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accent);
    // density goes on body so zoom applies to the full page content
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
        </Routes>
      </div>
    </div>
  );
}
