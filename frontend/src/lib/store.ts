import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";
export type Accent = "indigo" | "violet" | "emerald" | "amber" | "rose";
export type Density = "low" | "high";
export type CardVariant = "rich" | "compact" | "minimal" | "editorial";
export type AiProvider = "none" | "lm-studio" | "anthropic";

export type AiConfig = {
  provider: AiProvider;
  anthropicApiKey: string;
  lmStudioUrl: string;
  lmStudioModel: string;
};

export const DEFAULT_FOLDER_RULE = "{firma} – {rolle} – {datum}";
export const DEFAULT_DOC_RULE    = "{doc} – {name} – {firma} – {datum}";

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
        anthropicApiKey: "",
        lmStudioUrl: "http://localhost:1234",
        lmStudioModel: ""
      },
      driveNameFolder: DEFAULT_FOLDER_RULE,
      driveNameDoc:    DEFAULT_DOC_RULE,
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
    }),
    {
      name: "app-pal-ui-v2",
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
