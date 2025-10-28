/**
 * Wandelt eine Zeitangabe wie "1:30" oder "00:45" in Sekunden um.
 * Unterstützt optional Stundenangaben (z.B. "1:05:00"). Ungültige Eingaben ergeben 0 Sekunden.
 */
export function parseDuration(token) {
  if (!token) return 0;
  const cleaned = token.trim();
  if (!cleaned) return 0;
  const parts = cleaned.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Formatiert eine Sekundenanzahl als mm:ss oder hh:mm:ss, je nach Länge.
 */
export function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  const pad = (n) => String(n).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}
