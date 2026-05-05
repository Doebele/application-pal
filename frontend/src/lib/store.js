import { create } from "zustand";
export const useUiStore = create((set) => ({
    darkMode: false,
    toggleDarkMode: () => set((state) => ({
        darkMode: !state.darkMode
    }))
}));
