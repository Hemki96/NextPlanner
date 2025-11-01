import {
  highlightConfigPersistenceSupported,
  fetchHighlightVocabularyConfig,
} from "./highlight-config-client.js";
import { setHighlightVocabulary } from "./highlight-vocabulary.js";

/**
 * Lädt die Highlight-Vokabeln aus der persistenten Konfiguration und
 * informiert optionale Listener, sobald neue Daten zur Verfügung stehen.
 */
export async function bootstrapHighlightVocabulary({ onVocabularyLoaded } = {}) {
  if (!highlightConfigPersistenceSupported()) {
    return;
  }

  try {
    const { vocabulary } = await fetchHighlightVocabularyConfig();
    if (vocabulary) {
      setHighlightVocabulary(vocabulary);
      if (typeof onVocabularyLoaded === "function") {
        onVocabularyLoaded(vocabulary);
      }
    }
  } catch (error) {
    console.warn("Highlight-Konfiguration konnte nicht geladen werden", error);
  }
}
