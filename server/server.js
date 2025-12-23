import process from "node:process";

import { createServer } from "./app.js";
import { runtimeConfig } from "./config/runtime-config.js";
import { logger } from "./logger.js";

const port = runtimeConfig.server.port ?? 3000;
const server = createServer({ config: runtimeConfig });

let hasRetriedWithDynamicPort = false;
let currentPort = port;

function startServer(portToUse) {
  server.listen(portToUse, () => {
    const address = server.address();
    currentPort = typeof address === "object" && address ? address.port : portToUse;
    logger.info("NextPlanner Server läuft auf %s", `http://localhost:${currentPort}`);
  });
}

server.on("error", (error) => {
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
