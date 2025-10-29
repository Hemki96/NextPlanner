#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = "public/css";
const warnings = [];

async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectCssFiles(fullPath)));
    } else if (extname(entry.name) === ".css") {
      files.push(fullPath);
    }
  }
  return files;
}

async function lint() {
  let files = [];
  try {
    files = await collectCssFiles(root);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      console.log("Keine CSS-Dateien gefunden – nichts zu prüfen.");
      return;
    }
    throw error;
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (/!important/.test(content)) {
      warnings.push(`${file}: vermeide '!important', nutze stattdessen spezifischere Klassen.`);
    }
    const idSelectorPattern = /#([A-Za-z][\w-]*)/g;
    let match;
    while ((match = idSelectorPattern.exec(content))) {
      const selector = match[0];
      const name = match[1];
      if (/^[0-9a-fA-F]{3}$/.test(name) || /^[0-9a-fA-F]{6}$/.test(name) || /^[0-9a-fA-F]{8}$/.test(name)) {
        continue;
      }
      warnings.push(`${file}: ID-Selektor '${selector}' gefunden – bitte Klassen verwenden.`);
    }
  }

  if (warnings.length > 0) {
    warnings.forEach((message) => console.error(message));
    console.error(`\n${warnings.length} Hinweise gefunden.`);
    process.exitCode = 1;
  } else {
    console.log("CSS-Linting erfolgreich: keine Verstöße gefunden.");
  }
}

lint().catch((error) => {
  console.error("CSS-Linting fehlgeschlagen.", error);
  process.exitCode = 1;
});
