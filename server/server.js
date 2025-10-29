import process from "node:process";

import { createServer } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer();

server.listen(port, () => {
  console.log(`NextPlanner Server läuft auf http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`\n${signal} empfangen, Server wird beendet …`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
