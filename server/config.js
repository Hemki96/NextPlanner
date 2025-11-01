import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(CURRENT_DIR, "..");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data");

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
