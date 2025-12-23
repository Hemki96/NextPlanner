import { DEFAULT_DATA_DIR, PROJECT_ROOT, resolveDataDirectory } from "./config/runtime-config.js";

const DATA_DIR = resolveDataDirectory(process.env.NEXTPLANNER_DATA_DIR ?? process.env.DATA_DIR);

export { DATA_DIR, DEFAULT_DATA_DIR, PROJECT_ROOT };
