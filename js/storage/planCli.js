#!/usr/bin/env node
import process from "node:process";

import {
  JsonPlanStore,
  PlanValidationError,
  StorageIntegrityError,
} from "./jsonPlanStore.js";

function printUsage() {
  console.log(`Verwendung: node js/storage/planCli.js <befehl> [optionen]

Befehle:
  add --title="Titel" --date="2024-05-01" --focus="AR" --content="Plantext" [--metadata='{"key":"value"}']
      Fügt einen neuen Plan hinzu.
  list [--focus="AR"] [--from="2024-01-01"] [--to="2024-12-31"]
      Listet gespeicherte Pläne gefiltert nach Fokus oder Zeitraum auf.
  show --id=1
      Zeigt einen einzelnen Plan an.
  update --id=1 [--title=...] [--date=...] [--focus=...] [--content=...] [--metadata='{}']
      Aktualisiert einen existierenden Plan.
  delete --id=1
      Löscht einen Plan.
  Optionen:
  --storage-file="./data/plans.json"
      Überschreibt den Speicherort der Plan-Datei.
`);
}

function parseArgs(rawArgs) {
  const args = {};
  for (const raw of rawArgs) {
    if (!raw.startsWith("--")) {
      continue;
    }
    const [key, ...rest] = raw.slice(2).split("=");
    const value = rest.join("=");
    args[toCamelCase(key)] = value === "" ? true : value;
  }
  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/gi, (_, char) => char.toUpperCase());
}

function parseMetadataOption(option) {
  if (!option) {
    return undefined;
  }
  try {
    return JSON.parse(option);
  } catch (error) {
    throw new PlanValidationError(
      `Metadaten konnten nicht gelesen werden: ${error.message}`
    );
  }
}

function determineStorageFile(args) {
  let storageFile;
  const filtered = [];
  for (const arg of args) {
    if (arg.startsWith("--storage-file=")) {
      storageFile = arg.slice("--storage-file=".length);
    } else {
      filtered.push(arg);
    }
  }
  return { storageFile, filtered };
}

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION = 1;
const EXIT_IO = 2;

async function run(command, rest, store) {
  const options = parseArgs(rest);

  switch (command) {
    case "add": {
      const { title, date, focus, content, metadata } = options;
      if (!title || !date || !focus || !content) {
        throw new PlanValidationError(
          "Für 'add' sind --title, --date, --focus und --content erforderlich."
        );
      }
      const plan = await store.createPlan({
        title,
        planDate: date,
        focus,
        content,
        metadata: parseMetadataOption(metadata) ?? {},
      });
      console.log("Plan gespeichert:");
      console.log(JSON.stringify(plan, null, 2));
      return EXIT_SUCCESS;
    }
    case "list": {
      const { focus, from, to } = options;
      const plans = await store.listPlans({ focus, from, to });
      if (plans.length === 0) {
        console.log("Keine Pläne gefunden.");
        return EXIT_SUCCESS;
      }
      for (const plan of plans) {
        console.log(`- [${plan.focus}] ${plan.title} (${plan.planDate}) #${plan.id}`);
      }
      return EXIT_SUCCESS;
    }
    case "show": {
      const { id } = options;
      if (!id) {
        throw new PlanValidationError("Für 'show' wird --id benötigt.");
      }
      const plan = await store.getPlan(Number(id));
      if (!plan) {
        console.log("Plan nicht gefunden.");
      } else {
        console.log(JSON.stringify(plan, null, 2));
      }
      return EXIT_SUCCESS;
    }
    case "update": {
      const { id, title, date, focus, content, metadata } = options;
      if (!id) {
        throw new PlanValidationError("Für 'update' wird --id benötigt.");
      }
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (date !== undefined) updates.planDate = date;
      if (focus !== undefined) updates.focus = focus;
      if (content !== undefined) updates.content = content;
      if (metadata !== undefined) updates.metadata = parseMetadataOption(metadata);
      const updated = await store.updatePlan(Number(id), updates);
      if (!updated) {
        console.log("Plan nicht gefunden oder keine Änderungen vorgenommen.");
      } else {
        console.log("Plan aktualisiert:");
        console.log(JSON.stringify(updated, null, 2));
      }
      return EXIT_SUCCESS;
    }
    case "delete": {
      const { id } = options;
      if (!id) {
        throw new PlanValidationError("Für 'delete' wird --id benötigt.");
      }
      const removed = await store.deletePlan(Number(id));
      console.log(removed ? "Plan gelöscht." : "Plan nicht gefunden.");
      return EXIT_SUCCESS;
    }
    default:
      console.error(`Unbekannter Befehl '${command}'.`);
      printUsage();
      return EXIT_VALIDATION;
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
    printUsage();
    process.exit(rawArgs.length === 0 ? EXIT_VALIDATION : EXIT_SUCCESS);
  }

  const { storageFile, filtered } = determineStorageFile(rawArgs);
  const [command, ...rest] = filtered;

  if (!command) {
    printUsage();
    process.exit(EXIT_VALIDATION);
  }

  const store = new JsonPlanStore(storageFile ? { storageFile } : undefined);

  try {
    const exitCode = await run(command, rest, store);
    await store.close();
    process.exit(exitCode);
  } catch (error) {
    await store.close().catch(() => {});
    if (error instanceof PlanValidationError) {
      console.error(error.message);
      process.exit(EXIT_VALIDATION);
    }
    if (error instanceof StorageIntegrityError) {
      console.error(error.message);
      if (error.backupFile) {
        console.error(`Backup: ${error.backupFile}`);
      }
      process.exit(EXIT_IO);
    }
    console.error(error.message);
    process.exit(EXIT_IO);
  }
}

main();
