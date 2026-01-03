// Diese Datei ist ein kleiner Sammelpunkt, der zentrale Konfigurationswerte
// aus der Runtime-Konfiguration exportiert. So können andere Module die
// wichtigsten Pfade und Standardeinstellungen nutzen, ohne selbst
// nachvollziehen zu müssen, wie sie berechnet werden.
// Diese Datei bündelt zentrale Pfade und Konfigurationswerte aus der
// Runtime-Konfiguration, damit andere Module nicht selbst berechnen müssen,
// welche Ordner und Standardeinstellungen gelten. Die Kommentare sollen auch
// Einsteiger:innen ohne Vorwissen abholen.
import { DEFAULT_DATA_DIR, PROJECT_ROOT, runtimeConfig } from "./config/runtime-config.js";

// Der tatsächlich verwendete Datenordner stammt aus der zur Laufzeit
// ermittelten Konfiguration. Er kann je nach Umgebung abweichen (z. B. wenn
// per Environment-Variable ein anderer Pfad gesetzt wurde). Der Export erlaubt
// es anderen Modulen, immer den korrekt beschreibbaren Speicherort zu nutzen.
const DATA_DIR = runtimeConfig.paths.dataDir;

export { DATA_DIR, DEFAULT_DATA_DIR, PROJECT_ROOT };
