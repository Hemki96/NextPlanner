#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["public/js", "server"];
const errors = [];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (extname(entry.name) === ".js") {
      files.push(fullPath);
    }
  }
  return files;
}

function checkImportSpecifiers(content, file) {
  const importPattern = /import\s+[^"']*?from\s+(["'])([^"']+)\1/g;
  let match;
  while ((match = importPattern.exec(content))) {
    const specifier = match[2];
    if (specifier.startsWith("node:")) {
      continue;
    }
    if (specifier.startsWith("http:")) {
      errors.push(`${file}: externe HTTP-Imports sind nicht erlaubt.`);
      continue;
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      if (!/\.(js|json)$/.test(specifier)) {
        errors.push(
          `${file}: relative Imports müssen eine Dateiendung besitzen (gefunden: '${specifier}').`,
        );
      }
    }
  }
}

function checkVarDeclarations(content, file) {
  if (/\bvar\s+/.test(content)) {
    errors.push(`${file}: Bitte 'let' oder 'const' statt 'var' verwenden.`);
  }
}

async function lint() {
  for (const root of roots) {
    try {
      const files = await collectFiles(root);
      for (const file of files) {
        const content = await readFile(file, "utf8");
        checkImportSpecifiers(content, file);
        checkVarDeclarations(content, file);
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  if (errors.length > 0) {
    errors.forEach((message) => {
      console.error(message);
    });
    console.error(`\n${errors.length} Verstöße gefunden.`);
    process.exitCode = 1;
  } else {
    console.log("JavaScript-Linting erfolgreich: keine Verstöße gefunden.");
  }
}

lint().catch((error) => {
  console.error("Linting konnte nicht abgeschlossen werden.", error);
  process.exitCode = 1;
});
