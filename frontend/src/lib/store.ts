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
  // Google Drive naming rules
  driveNameFolder: string;
  driveNameDoc: string;
  // Google Drive parent folder for new application folders (empty = My Drive root)
  driveApplicationsFolderId: string;
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
  setDriveApplicationsFolderId: (id: string) => void;
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
      driveApplicationsFolderId: "",
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
      setDriveApplicationsFolderId: (driveApplicationsFolderId) => set({ driveApplicationsFolderId }),
    }),
    {
      name: "app-pal-ui-v2",
      migrate: (persisted: unknown) => {
        const s = persisted as Record<string, unknown>;
        if (s?.density === "compact") s.density = "high";
        if (s?.density === "comfortable") s.density = "low";
        // Seed defaults for new drive naming fields
        if (!s?.driveNameFolder) s.driveNameFolder = DEFAULT_FOLDER_RULE;
        if (!s?.driveNameDoc)    s.driveNameDoc    = DEFAULT_DOC_RULE;
        return s;
      }
    }
  )
);
