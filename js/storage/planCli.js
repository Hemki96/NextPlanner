#!/usr/bin/env node
import { JsonPlanStore } from "./jsonPlanStore.js";

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
    throw new Error(`Metadaten konnten nicht gelesen werden: ${error.message}`);
  }
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h") {
  printUsage();
  process.exit(command ? 0 : 1);
}

const store = new JsonPlanStore();

try {
  const options = parseArgs(rest);

  switch (command) {
    case "add": {
      const { title, date, focus, content, metadata } = options;
      if (!title || !date || !focus || !content) {
        throw new Error("Für 'add' sind --title, --date, --focus und --content erforderlich.");
      }
      const plan = store.createPlan({
        title,
        planDate: date,
        focus,
        content,
        metadata: parseMetadataOption(metadata) ?? {},
      });
      console.log("Plan gespeichert:");
      console.log(JSON.stringify(plan, null, 2));
      break;
    }
    case "list": {
      const { focus, from, to } = options;
      const plans = store.listPlans({ focus, from, to });
      if (plans.length === 0) {
        console.log("Keine Pläne gefunden.");
        break;
      }
      for (const plan of plans) {
        console.log(`- [${plan.focus}] ${plan.title} (${plan.planDate}) #${plan.id}`);
      }
      break;
    }
    case "show": {
      const { id } = options;
      if (!id) {
        throw new Error("Für 'show' wird --id benötigt.");
      }
      const plan = store.getPlan(Number(id));
      if (!plan) {
        console.log("Plan nicht gefunden.");
      } else {
        console.log(JSON.stringify(plan, null, 2));
      }
      break;
    }
    case "update": {
      const { id, title, date, focus, content, metadata } = options;
      if (!id) {
        throw new Error("Für 'update' wird --id benötigt.");
      }
      const updated = store.updatePlan(Number(id), {
        title,
        planDate: date,
        focus,
        content,
        metadata: parseMetadataOption(metadata),
      });
      if (!updated) {
        console.log("Plan nicht gefunden oder keine Änderungen vorgenommen.");
      } else {
        console.log("Plan aktualisiert:");
        console.log(JSON.stringify(updated, null, 2));
      }
      break;
    }
    case "delete": {
      const { id } = options;
      if (!id) {
        throw new Error("Für 'delete' wird --id benötigt.");
      }
      const removed = store.deletePlan(Number(id));
      console.log(removed ? "Plan gelöscht." : "Plan nicht gefunden.");
      break;
    }
    default:
      console.error(`Unbekannter Befehl '${command}'.`);
      printUsage();
      process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
} finally {
  store.close();
}
