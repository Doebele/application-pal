import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
<<<<<<< HEAD
      "/api": "http://localhost:80"
=======
      "/api": "http://localhost:3300"
>>>>>>> f1d3e21 (feat: Phase 2 — Profile Wallet, Google OAuth, Documents/Activities/Contacts APIs)
    }
  }
});
