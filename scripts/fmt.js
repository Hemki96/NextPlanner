#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const jsonTargets = [
  "package.json",
  "data/plans.json",
  "data/team-snippets.json",
];

async function formatJsonFile(file) {
  let original;
  try {
    original = await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { file, changed: false, skipped: true };
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(original);
  } catch (error) {
    console.error(`${file}: konnte JSON nicht parsen.`);
    throw error;
  }

  const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
  if (formatted !== original) {
    await writeFile(file, formatted, "utf8");
    return { file, changed: true, skipped: false };
  }
  return { file, changed: false, skipped: false };
}

async function main() {
  const results = await Promise.all(jsonTargets.map((file) => formatJsonFile(file)));
  const changed = results.filter((item) => item.changed);
  const skipped = results.filter((item) => item.skipped);

  changed.forEach((item) => {
    console.log(`Formatiert: ${item.file}`);
  });

  if (skipped.length > 0) {
    skipped.forEach((item) => {
      console.warn(`Übersprungen (nicht gefunden): ${item.file}`);
    });
  }

  if (changed.length === 0) {
    console.log("Alle JSON-Dateien waren bereits formatiert.");
  }
}

main().catch((error) => {
  console.error("Formatierung fehlgeschlagen.", error);
  process.exitCode = 1;
});
