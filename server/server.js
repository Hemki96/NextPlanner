import process from "node:process";

import { createServer } from "./app.js";
import { logger } from "./logger.js";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const port = Number(process.env.PORT ?? 3000);
const server = createServer();

server.listen(port, () => {
  logger.info("NextPlanner Server läuft auf %s", `http://localhost:${port}`);
});
