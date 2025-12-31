// Einstiegspunkt der Anwendung. Er liest die Laufzeitkonfiguration ein, startet
// den HTTP-Server und reagiert auf typische Startfehler wie bereits belegte
// Ports. Die Kommentare begleiten alle Schritte für ein besseres Verständnis.
import process from "node:process";

import { createServer } from "./app.js";
import { runtimeConfig } from "./config/runtime-config.js";
import { logger } from "./logger.js";
import { RuntimeConfigError, buildRuntimeConfig } from "./config/runtime-config.js";

const port = runtimeConfig.server.port ?? 3000;
const server = createServer({ config: runtimeConfig });

// Bereits beim Start gesammelte Warnungen (z. B. zu Datenpfaden) werden hier
// ausgegeben, damit Administrator:innen sie sehen.
if (runtimeConfig.warnings?.length) {
  for (const warning of runtimeConfig.warnings) {
    logger.warn(warning);
  }
}

let hasRetriedWithDynamicPort = false;
let currentPort = port;

function startServer(portToUse) {
  // Startet den HTTP-Server und merkt sich den tatsächlich genutzten Port
  // (wichtig, wenn 0 für einen zufälligen Port übergeben wurde).
  server.listen(portToUse, () => {
    const address = server.address();
    currentPort = typeof address === "object" && address ? address.port : portToUse;
    logger.info("NextPlanner Server läuft auf %s", `http://localhost:${currentPort}`);
  });
}

server.on("error", (error) => {
  // Typische Fehlerbehandlung: Sollte der gewünschte Port belegt sein,
  // versuchen wir einmalig automatisch einen freien Port, sofern die PORT
  // Umgebungsvariable nicht gesetzt ist. Anschließend wird klar geloggt, was zu
  // tun ist.
  if (error?.code === "EADDRINUSE") {
    if (!hasRetriedWithDynamicPort && process.env.PORT === undefined) {
      hasRetriedWithDynamicPort = true;
      logger.warn(
        "Port %d ist bereits belegt. Versuche automatischen freien Port (PORT nicht gesetzt).",
        currentPort,
      );
      startServer(0);
      return;
    }
    logger.error(
      "Port %d ist bereits in Verwendung. Setzen Sie eine andere PORT-Variable oder beenden Sie den Prozess auf diesem Port.",
      currentPort,
    );
  } else {
    logger.error("Server konnte nicht starten: %s", error instanceof Error ? error.message : error);
  }
  process.exit(1);
});

startServer(port);
