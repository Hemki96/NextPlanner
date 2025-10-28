/**
 * Gibt eine Distanz in Metern aus und wandelt große Werte optional in Kilometer um.
 */
export function formatDistance(distance) {
  if (!distance) return "0 m";
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(2)} km`;
  }
  return `${distance} m`;
}
