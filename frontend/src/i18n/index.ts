import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// DE
import deCommon  from "./de/common.json";
import deStages  from "./de/stages.json";
import deActions from "./de/actions.json";

// EN
import enCommon  from "./en/common.json";
import enStages  from "./en/stages.json";
import enActions from "./en/actions.json";

export const SUPPORTED_LANGUAGES = ["de", "en"] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      de: { common: deCommon, stages: deStages, actions: deActions },
      en: { common: enCommon, stages: enStages, actions: enActions },
    },
    fallbackLng: "de",
    defaultNS: "common",
    ns: ["common", "stages", "actions"],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // Order of sources — we override with our Zustand store value anyway
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "app-pal-ui-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
