import { create } from "zustand";

type UiState = {
  darkMode: boolean;
  selectedApplicationId: string | null;
  isImportModalOpen: boolean;
  toggleDarkMode: () => void;
  setSelectedApplicationId: (applicationId: string | null) => void;
  setImportModalOpen: (isOpen: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  darkMode: false,
  selectedApplicationId: null,
  isImportModalOpen: false,
  toggleDarkMode: () =>
    set((state) => ({
      darkMode: !state.darkMode
    })),
  setSelectedApplicationId: (applicationId) =>
    set(() => ({
      selectedApplicationId: applicationId
    })),
  setImportModalOpen: (isOpen) =>
    set(() => ({
      isImportModalOpen: isOpen
    }))
}));
