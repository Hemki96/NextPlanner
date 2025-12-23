#!/usr/bin/env node
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  JsonPlanStore,
  PlanConflictError,
  PlanValidationError,
  StorageIntegrityError,
} from "../stores/json-plan-store.js";
import {
  RuntimeConfigError,
  buildRuntimeConfig,
  runtimeConfig,
} from "../config/runtime-config.js";

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION = 1;
const EXIT_IO = 2;

function printUsage() {
  console.log(`Verwendung: node server/cli/plan-cli.js <befehl> [optionen]

Befehle:
  list [--focus=AR] [--from=2024-01-01] [--to=2024-12-31]
      Listet vorhandene Pläne als Tabelle oder JSON (--json).
  show <id>
      Zeigt einen einzelnen Plan an (--json für Rohdaten).
  export <id> --format=json
      Gibt einen Plan im gewünschten Format aus (derzeit nur JSON).
  validate <id>
      Prüft, ob ein Plan den Validierungsregeln entspricht.
  backup [--prune=20]
      Erstellt eine Datensicherung und behält optional nur die letzten n Backups.

Globale Optionen:
  --storage-file=./data/plans.json   Alternativer Speicherort der JSON-Datenbank.
  --json                             Ausgabe konsequent als JSON.
  --help                             Zeigt diese Übersicht an.
`);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/gi, (_, char) => char.toUpperCase());
}

function parseCommandArguments(args) {
  const options = {};
  const positionals = [];
  let index = 0;
  while (index < args.length) {
    const current = args[index];
    if (current.startsWith("--")) {
      const [flag, ...rest] = current.slice(2).split("=");
      if (rest.length > 0) {
        options[toCamelCase(flag)] = rest.join("=");
        index += 1;
      } else {
        const next = args[index + 1];
        if (next && !next.startsWith("--")) {
          options[toCamelCase(flag)] = next;
          index += 2;
        } else {
          options[toCamelCase(flag)] = true;
          index += 1;
        }
      }
    } else {
      positionals.push(current);
      index += 1;
    }
  }
  return { options, positionals };
}

function splitGlobalOptions(argv) {
  const rest = [];
  let storageFile;
  let jsonOutput = false;
  for (const arg of argv) {
    if (arg.startsWith("--storage-file=")) {
      storageFile = arg.slice("--storage-file=".length);
      continue;
    }
    if (arg === "--json") {
      jsonOutput = true;
      continue;
    }
    rest.push(arg);
  }
  return { storageFile, jsonOutput, rest };
}

function formatPlansTable(plans) {
  const lines = ["ID   Datum       Fokus  Titel"];
  for (const plan of plans) {
    const id = String(plan.id).padStart(3, " ");
    const date = (plan.planDate ?? "").slice(0, 10).padEnd(10, " ");
    const focus = (plan.focus ?? "").padEnd(6, " ");
    const title = plan.title ?? "";
    lines.push(`${id}  ${date}  ${focus} ${title}`);
  }
  return lines.join("\n");
}

async function handleList(store, { options }, jsonOutput) {
  const plans = await store.listPlans({
    focus: options.focus,
    from: options.from,
    to: options.to,
  });
  if (jsonOutput) {
    console.log(JSON.stringify(plans, null, 2));
    return EXIT_SUCCESS;
  }
  if (plans.length === 0) {
    console.log("Keine Pläne gefunden.");
    return EXIT_SUCCESS;
  }
  console.log(formatPlansTable(plans));
  return EXIT_SUCCESS;
}

async function handleShow(store, { options, positionals }, jsonOutput) {
  const idValue = positionals[0] ?? options.id;
  if (!idValue) {
    throw new PlanValidationError("Für 'show' wird eine Plan-ID benötigt.");
  }
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PlanValidationError("Die Plan-ID muss eine positive Ganzzahl sein.");
  }
  const plan = await store.getPlan(id);
  if (!plan) {
    throw new PlanValidationError(`Plan mit ID ${id} wurde nicht gefunden.`);
  }
  if (jsonOutput) {
    console.log(JSON.stringify(plan, null, 2));
    return EXIT_SUCCESS;
  }
  console.log(`#${plan.id} – ${plan.title}`);
  console.log(`Datum: ${plan.planDate}`);
  console.log(`Fokus: ${plan.focus}`);
  console.log("");
  console.log("Inhalt:");
  console.log(plan.content);
  const metadataKeys = Object.keys(plan.metadata ?? {});
  if (metadataKeys.length > 0) {
    console.log("");
    console.log("Metadaten:");
    for (const key of metadataKeys) {
      console.log(`- ${key}: ${plan.metadata[key]}`);
    }
  }
  return EXIT_SUCCESS;
}

async function handleExport(store, { options, positionals }, jsonOutput) {
  const idValue = positionals[0] ?? options.id;
  if (!idValue) {
    throw new PlanValidationError("Für 'export' wird eine Plan-ID benötigt.");
  }
  const format = options.format ?? "json";
  if (format !== "json") {
    throw new PlanValidationError("Derzeit wird nur --format=json unterstützt.");
  }
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PlanValidationError("Die Plan-ID muss eine positive Ganzzahl sein.");
  }
  const plan = await store.getPlan(id);
  if (!plan) {
    throw new PlanValidationError(`Plan mit ID ${id} wurde nicht gefunden.`);
  }
  console.log(JSON.stringify(plan, null, 2));
  return EXIT_SUCCESS;
}

async function handleValidate(store, { options, positionals }, jsonOutput) {
  const idValue = positionals[0] ?? options.id;
  if (!idValue) {
    throw new PlanValidationError("Für 'validate' wird eine Plan-ID benötigt.");
  }
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PlanValidationError("Die Plan-ID muss eine positive Ganzzahl sein.");
  }
  const plan = await store.getPlan(id);
  if (!plan) {
    throw new PlanValidationError(`Plan mit ID ${id} wurde nicht gefunden.`);
  }
  await store.replacePlan(id, plan, { expectedUpdatedAt: plan.updatedAt });
  if (jsonOutput) {
    console.log(JSON.stringify({ id: plan.id, valid: true }, null, 2));
  } else {
    console.log(`Plan #${plan.id} ist gültig.`);
  }
  return EXIT_SUCCESS;
}

function formatBackupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

async function pruneBackups(directory, keep) {
  if (keep <= 0) {
    return 0;
  }
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const toRemove = files.slice(keep);
  await Promise.all(
    toRemove.map((name) => rm(path.join(directory, name), { force: true }))
  );
  return toRemove.length;
}

async function handleBackup(store, { options }, jsonOutput) {
  const prune = options.prune ? Number(options.prune) : 0;
  if (Number.isNaN(prune) || prune < 0) {
    throw new PlanValidationError("--prune muss eine nicht-negative Zahl sein.");
  }
  const backup = await store.exportBackup();
  const storageDir = path.dirname(store.storageFile);
  const backupDir = path.join(storageDir, "backups");
  await mkdir(backupDir, { recursive: true });
  const fileName = `plans-${formatBackupTimestamp()}.json`;
  const filePath = path.join(backupDir, fileName);
  await writeFile(filePath, JSON.stringify(backup, null, 2), "utf8");
  const removed = await pruneBackups(backupDir, prune);
  if (jsonOutput) {
    console.log(
      JSON.stringify(
        { file: filePath, planCount: backup.planCount, pruned: removed },
        null,
        2,
      ),
    );
  } else {
    console.log(`Sicherung gespeichert: ${filePath}`);
    console.log(`Enthaltene Pläne: ${backup.planCount}`);
    if (prune > 0) {
      console.log(`Alte Sicherungen entfernt: ${removed}`);
    }
  }
  return EXIT_SUCCESS;
}

async function runCommand(command, args, store, jsonOutput) {
  switch (command) {
    case "list":
      return handleList(store, args, jsonOutput);
    case "show":
      return handleShow(store, args, jsonOutput);
    case "export":
      return handleExport(store, args, jsonOutput);
    case "validate":
      return handleValidate(store, args, jsonOutput);
    case "backup":
      return handleBackup(store, args, jsonOutput);
    default:
      console.error(`Unbekannter Befehl '${command}'.`);
      printUsage();
      return EXIT_VALIDATION;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(argv.length === 0 ? EXIT_VALIDATION : EXIT_SUCCESS);
  }

  try {
    buildRuntimeConfig();
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      console.error(error.message);
      process.exit(EXIT_VALIDATION);
    }
    throw error;
  }

  const { storageFile, jsonOutput, rest } = splitGlobalOptions(argv);
  const [command, ...commandArgs] = rest;
  if (!command) {
    printUsage();
    process.exit(EXIT_VALIDATION);
  }

  const parsed = parseCommandArguments(commandArgs);
  const resolvedStorageFile =
    storageFile ?? path.join(runtimeConfig.paths.dataDir, "plans.json");
  const store = new JsonPlanStore({ storageFile: resolvedStorageFile });

  try {
    const exitCode = await runCommand(command, parsed, store, jsonOutput);
    await store.close();
    process.exit(exitCode);
  } catch (error) {
    await store.close().catch(() => {});
    if (error instanceof PlanValidationError) {
      console.error(error.message);
      process.exit(EXIT_VALIDATION);
    }
    if (error instanceof PlanConflictError) {
      console.error(error.message);
      if (error.currentPlan) {
        console.error(JSON.stringify(error.currentPlan, null, 2));
      }
      process.exit(EXIT_IO);
    }
    if (error instanceof StorageIntegrityError) {
      console.error(error.message);
      if (error.backupFile) {
        console.error(`Backup isoliert in: ${error.backupFile}`);
      }
      process.exit(EXIT_IO);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_IO);
  }
}

main();
