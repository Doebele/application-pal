import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";
export type Accent = "indigo" | "violet" | "emerald" | "amber" | "rose";
export type Density = "low" | "high";
export type CardVariant = "rich" | "compact" | "minimal" | "editorial";
export type AiProvider = "none" | "lm-studio" | "anthropic" | "openai" | "gemini" | "openrouter" | "ollama";
export type UiLanguage = "de" | "en" | "fr";

export type AiConfig = {
  provider: AiProvider;
  // LM Studio
  lmStudioUrl: string;
  lmStudioModel: string;
  // Anthropic
  anthropicApiKey: string;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  // Google Gemini
  geminiApiKey: string;
  geminiModel: string;
  // OpenRouter
  openrouterApiKey: string;
  openrouterModel: string;
  // Ollama
  ollamaUrl: string;
  ollamaModel: string;
};

export const DEFAULT_FOLDER_RULE = "{firma} – {rolle} – {datum}";
export const DEFAULT_DOC_RULE    = "{doc} – {name} – {firma} – {datum}";

// In-flight / freshly-finished AI generations, tracked per application so the
// state survives switching tiles (drawer unmount/remount). NOT persisted — a
// "running" job can't survive a full page reload, and finished results live in
// the DB anyway.
export type AiJobKind = "cover-letter" | "letter-review";
export type AiJob = { status: "running" | "done"; seen: boolean; at: number };
export type AiJobsMap = Record<string, Partial<Record<AiJobKind, AiJob>>>;

type UiState = {
  theme: Theme;
  accent: Accent;
  density: Density;
  cardVariant: CardVariant;
  railOpen: boolean;
  selectedApplicationId: string | null;
  isImportModalOpen: boolean;
  ai: AiConfig;
  // Google Drive naming rules (UI preferences, kept in local store)
  driveNameFolder: string;
  driveNameDoc: string;
  // NOTE: driveApplicationsFolderId moved to user_profile (per-user, server-side)
  // UI language preference (separate from applications.language which is the document language)
  uiLanguage: UiLanguage;
  setUiLanguage: (lang: UiLanguage) => void;
  // Table view column config
  tableColumnOrder: string[];
  tableColumnVisibility: Record<string, boolean>;
  tableColumnPinning: { left: string[]; right: string[] };
  tableColumnSizing: Record<string, number>;
  setTableColumnOrder: (order: string[]) => void;
  setTableColumnVisibility: (vis: Record<string, boolean>) => void;
  setTableColumnPinning: (pinning: { left: string[]; right: string[] }) => void;
  setTableColumnSizing: (sizing: Record<string, number>) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAccent: (accent: Accent) => void;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
  setCardVariant: (variant: CardVariant) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  setSelectedApplicationId: (id: string | null) => void;
  setImportModalOpen: (isOpen: boolean) => void;
  setAi: (ai: Partial<AiConfig>) => void;
  setDriveNameFolder: (rule: string) => void;
  setDriveNameDoc: (rule: string) => void;
  // Per-application AI generation tracking (survives tile switches, not reloads)
  aiJobs: AiJobsMap;
  startAiJob: (appId: string, kind: AiJobKind) => void;
  finishAiJob: (appId: string, kind: AiJobKind) => void;
  markAiJobsSeen: (appId: string) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "indigo",
      density: "high",
      cardVariant: "rich",
      railOpen: true,
      selectedApplicationId: null,
      isImportModalOpen: false,
      ai: {
        provider: "none",
        lmStudioUrl: "http://localhost:1234",
        lmStudioModel: "",
        anthropicApiKey: "",
        openaiApiKey: "",
        openaiModel: "gpt-4o-mini",
        geminiApiKey: "",
        geminiModel: "gemini-2.0-flash",
        openrouterApiKey: "",
        openrouterModel: "",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "",
      },
      driveNameFolder: DEFAULT_FOLDER_RULE,
      driveNameDoc:    DEFAULT_DOC_RULE,
      uiLanguage: "de",
      setUiLanguage: (uiLanguage) => set({ uiLanguage }),
      tableColumnOrder: [],
      tableColumnVisibility: {},
      tableColumnPinning: { left: ["company"], right: [] },
      tableColumnSizing: {},
      setTableColumnOrder: (tableColumnOrder) => set({ tableColumnOrder }),
      setTableColumnVisibility: (tableColumnVisibility) => set({ tableColumnVisibility }),
      setTableColumnPinning: (tableColumnPinning) => set({ tableColumnPinning }),
      setTableColumnSizing: (tableColumnSizing) => set({ tableColumnSizing }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      toggleDensity: () => set((s) => ({ density: s.density === "high" ? "low" : "high" })),
      setCardVariant: (cardVariant) => set({ cardVariant }),
      setRailOpen: (railOpen) => set({ railOpen }),
      toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
      setSelectedApplicationId: (selectedApplicationId) => set({ selectedApplicationId }),
      setImportModalOpen: (isImportModalOpen) => set({ isImportModalOpen }),
      setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setDriveNameFolder: (driveNameFolder) => set({ driveNameFolder }),
      setDriveNameDoc:    (driveNameDoc)    => set({ driveNameDoc }),
      aiJobs: {},
      startAiJob: (appId, kind) => set((s) => ({
        aiJobs: { ...s.aiJobs, [appId]: { ...s.aiJobs[appId], [kind]: { status: "running", seen: true, at: Date.now() } } },
      })),
      finishAiJob: (appId, kind) => set((s) => ({
        // seen:false → the tile shows a "new result" marker until the user opens this app
        aiJobs: { ...s.aiJobs, [appId]: { ...s.aiJobs[appId], [kind]: { status: "done", seen: false, at: Date.now() } } },
      })),
      markAiJobsSeen: (appId) => set((s) => {
        const cur = s.aiJobs[appId];
        if (!cur) return {} as Partial<UiState>;
        const next: Partial<Record<AiJobKind, AiJob>> = {};
        for (const k of Object.keys(cur) as AiJobKind[]) next[k] = { ...cur[k]!, seen: true };
        return { aiJobs: { ...s.aiJobs, [appId]: next } };
      }),
    }),
    {
      name: "app-pal-ui-v2",
      // aiJobs is in-memory only (see type comment) — never persist it.
      partialize: (state) => {
        const rest = { ...state } as Partial<UiState>;
        delete rest.aiJobs;
        return rest;
      },
      migrate: (persisted: unknown) => {
        const s = persisted as Record<string, unknown>;
        if (s?.density === "compact") s.density = "high";
        if (s?.density === "comfortable") s.density = "low";
        if (!s?.driveNameFolder) s.driveNameFolder = DEFAULT_FOLDER_RULE;
        if (!s?.driveNameDoc)    s.driveNameDoc    = DEFAULT_DOC_RULE;
        // Remove legacy field (now stored in user_profile)
        delete s.driveApplicationsFolderId;
        return s;
      }
    }
  )
);
