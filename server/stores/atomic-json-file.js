// Gemeinsamer Schreibweg für alle JSON-Stores: atomare Writes mit temporärer
// Datei, fsync und Directory-fsync sowie eine dateibasierte Sperre, die auch
// zwischen CLI und Serverprocess wirkt. Zusätzlich können beschädigte Dateien
// isoliert statt überschrieben werden.
import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";

import { logger } from "../logger.js";

const ENCODING = "utf8";
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isDirFsyncUnsupported(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  return ["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error.code);
}

let dirFsyncSupported = true;
let dirFsyncWarned = false;

function warnDirFsync(dir) {
  if (dirFsyncWarned) {
    return;
  }
  dirFsyncWarned = true;
  logger.warn(
    "Directory fsync is not supported on this platform. Continuing without fsync for '%s'.",
    dir,
  );
}

async function fsyncDirectory(dir) {
  if (!dirFsyncSupported) {
    return;
  }
  const flags = (constants.O_DIRECTORY ?? 0) | constants.O_RDONLY;
  let handle;
  try {
    handle = await fs.open(dir, flags);
  } catch (error) {
    if (isDirFsyncUnsupported(error)) {
      dirFsyncSupported = false;
      warnDirFsync(dir);
      return;
    }
    throw error;
  }

  try {
    if (typeof handle.sync === "function") {
      await handle.sync();
    } else {
      dirFsyncSupported = false;
      warnDirFsync(dir);
    }
  } catch (error) {
    if (isDirFsyncUnsupported(error)) {
      dirFsyncSupported = false;
      warnDirFsync(dir);
    } else {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function isStaleLock(lockFile) {
  let raw;
  try {
    raw = await fs.readFile(lockFile, ENCODING);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return true;
    }
    return false;
  }
  const pid = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

// Sperrt die Zieldatei über Prozessgrenzen hinweg. Die Sperre wird in jedem
// Fall wieder aufgehoben, auch wenn die eigentliche Operation fehlschlägt.
async function withFileLock(filePath, task) {
  const lockFile = `${filePath}.lock`;
  await fs.mkdir(dirname(filePath), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let handle = null;

  while (Date.now() < deadline) {
    try {
      handle = await fs.open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      if (await isStaleLock(lockFile)) {
        await fs.rm(lockFile, { force: true }).catch(() => {});
        continue;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  if (!handle) {
    throw new Error(`Timeout beim Warten auf die Dateisperre für '${basename(lockFile)}'.`);
  }

  try {
    await handle.writeFile(String(process.pid), ENCODING);
    await handle.sync();
  } finally {
    await handle.close().catch(() => {});
  }

  try {
    return await task();
  } finally {
    await fs.rm(lockFile, { force: true }).catch(() => {});
  }
}

// Schreibt JSON über eine temporäre Datei und ersetzt die Zieldatei erst nach
// erfolgreichem fsync. Bei einem Fehler bleibt die alte Datei unangetastet.
async function writeJsonFileAtomically(filePath, data) {
  return withFileLock(filePath, async () => {
    const dir = dirname(filePath);
    const base = basename(filePath);
    const tempFile = join(dir, `.${base}.${process.pid}.${randomUUID()}.tmp`);
    const payload = JSON.stringify(data);

    let handle;
    try {
      handle = await fs.open(tempFile, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY, 0o600);
      await handle.writeFile(payload, ENCODING);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(tempFile, filePath);
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.rm(tempFile, { force: true }).catch(() => {});
      throw error;
    }

    await fsyncDirectory(dir);
  });
}

// Verschiebt eine beschädigte Datei unter einem erkennbaren Namen, damit ihre
// Daten erhalten bleiben, und gibt den Basisnamen der Sicherung zurück.
async function isolateCorruptFile(filePath) {
  const dir = dirname(filePath);
  const base = basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = join(dir, `${base}.corrupt-${timestamp}`);
  try {
    await fs.rename(filePath, backupFile);
    return basename(backupFile);
  } catch {
    return null;
  }
}

export { withFileLock, writeJsonFileAtomically, isolateCorruptFile };
