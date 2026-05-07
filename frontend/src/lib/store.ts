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

type UiState = {
  theme: Theme;
  accent: Accent;
  density: Density;
  cardVariant: CardVariant;
  railOpen: boolean;
  selectedApplicationId: string | null;
  isImportModalOpen: boolean;
  ai: AiConfig;
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
      setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } }))
    }),
    {
      name: "app-pal-ui-v2",
      migrate: (persisted: unknown) => {
        const s = persisted as Record<string, unknown>;
        if (s?.density === "compact") s.density = "high";
        if (s?.density === "comfortable") s.density = "low";
        return s;
      }
    }
  )
);
