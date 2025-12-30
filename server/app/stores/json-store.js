import { constants, promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";

const DEFAULT_ENCODING = "utf8";

function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

async function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

function defaultNormalize(data) {
  return data;
}

function defaultCorruptHandler() {
  return null;
}

class JsonStore {
  #filePath;
  #data;
  #ready;
  #writeQueue = Promise.resolve();
  #dirFsyncSupported = true;
  #dirFsyncWarned = false;
  #normalize;
  #onCorrupt;

  constructor({ filePath, defaultValue = {}, normalize = defaultNormalize, onCorrupt = defaultCorruptHandler } = {}) {
    if (!filePath) {
      throw new Error("filePath is required for JsonStore");
    }
    this.#filePath = filePath;
    this.#normalize = normalize;
    this.#onCorrupt = onCorrupt;
    this.#data = defaultValue;
    this.#ready = this.#load(defaultValue);
  }

  async #load(defaultValue) {
    await ensureDirectory(this.#filePath);
    try {
      const raw = await fs.readFile(this.#filePath, DEFAULT_ENCODING);
      const parsed = JSON.parse(raw);
      this.#data = this.#normalize(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.#data = this.#normalize(defaultValue);
        await this.#writeFileAtomically(this.#data);
        return;
      }
      if (error instanceof SyntaxError) {
        const replacement = this.#onCorrupt(error);
        if (replacement !== null && replacement !== undefined) {
          this.#data = this.#normalize(replacement);
          await this.#writeFileAtomically(this.#data);
          return;
        }
      }
      throw error;
    }
  }

  async #writeFileAtomically(data) {
    const dir = dirname(this.#filePath);
    const base = basename(this.#filePath);
    const tempFile = join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
    const payload = JSON.stringify(data);

    let handle;
    try {
      handle = await fs.open(tempFile, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY, 0o600);
      await handle.writeFile(payload, DEFAULT_ENCODING);
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.rm(tempFile, { force: true }).catch(() => {});
      throw error;
    }

    try {
      await handle.close();
    } catch (error) {
      await fs.rm(tempFile, { force: true }).catch(() => {});
      throw error;
    }

    try {
      await fs.rename(tempFile, this.#filePath);
    } catch (error) {
      if (error?.code === "EEXIST") {
        await fs.rm(this.#filePath, { force: true });
        await fs.rename(tempFile, this.#filePath);
      } else {
        await fs.rm(tempFile, { force: true }).catch(() => {});
        throw error;
      }
    }

    await this.#fsyncDirectory(dir);
  }

  async #fsyncDirectory(dir) {
    if (!this.#dirFsyncSupported) {
      return;
    }
    const flags = (constants.O_DIRECTORY ?? 0) | constants.O_RDONLY;
    let handle;
    try {
      handle = await fs.open(dir, flags);
    } catch (error) {
      if (this.#isDirFsyncUnsupported(error)) {
        this.#dirFsyncSupported = false;
        this.#logDirFsyncWarning(dir);
        return;
      }
      throw error;
    }

    try {
      if (typeof handle.sync === "function") {
        await handle.sync();
      } else {
        this.#dirFsyncSupported = false;
        this.#logDirFsyncWarning(dir);
      }
    } catch (error) {
      if (this.#isDirFsyncUnsupported(error)) {
        this.#dirFsyncSupported = false;
        this.#logDirFsyncWarning(dir);
      } else {
        throw error;
      }
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  #isDirFsyncUnsupported(error) {
    if (!error || typeof error !== "object") {
      return false;
    }
    return ["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error.code);
  }

  #logDirFsyncWarning(dir) {
    if (this.#dirFsyncWarned) {
      return;
    }
    this.#dirFsyncWarned = true;
    // eslint-disable-next-line no-console
    console.warn("Directory fsync is not supported on this platform. Continuing without fsync for '%s'.", dir);
  }

  async ready() {
    await this.#ready;
  }

  snapshot() {
    return cloneValue(this.#data);
  }

  async update(mutator) {
    await this.ready();
    this.#writeQueue = this.#writeQueue.then(async () => {
      const nextData = mutator ? await mutator(cloneValue(this.#data)) : this.#data;
      this.#data = this.#normalize(nextData);
      await this.#writeFileAtomically(this.#data);
    });
    this.#writeQueue = this.#writeQueue.catch((error) => {
      this.#writeQueue = Promise.resolve();
      throw error;
    });
    return this.#writeQueue;
  }

  async close() {
    await this.ready();
    await this.#writeQueue;
  }
}

export { JsonStore };
