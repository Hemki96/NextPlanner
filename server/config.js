import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(CURRENT_DIR, "..");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data");

/**
 * Resolves an optional environment override for the data directory. Relative
 * paths are expanded from the project root so deployments can mount volumes
 * without changing the code base.
 *
 * @param {string|undefined|null} value
 * @returns {string|null}
 */
function resolveConfiguredDir(value) {
  if (!value) {
    return null;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(PROJECT_ROOT, value);
}

const DATA_DIR = resolveConfiguredDir(
  process.env.NEXTPLANNER_DATA_DIR ?? process.env.DATA_DIR,
) ?? DEFAULT_DATA_DIR;

export { DATA_DIR, DEFAULT_DATA_DIR, PROJECT_ROOT };
