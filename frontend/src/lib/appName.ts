// Product name shown to users. The desktop app (Tauri shell present) is "Apply-Pal" —
// the name registered on Google's OAuth consent screen, which must match what the app
// shows. The web/Docker version keeps "Application-Pal". i18n strings use {{app}}.
import { hasShell } from "./desktopShell";

export const APP_NAME = hasShell() ? "Apply-Pal" : "Application-Pal";
