import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--fg-3)", fontSize: 13 }}>
      Laden…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
