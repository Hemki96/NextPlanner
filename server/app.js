// Zentrale Startlogik des Servers. Hier werden alle Services, Stores und der
// HTTP-Server zusammengesetzt. Die Kommentare erläutern jeden Schritt für
// Personen, die wenig Erfahrung mit Node.js haben.
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { createApp, DEFAULT_PUBLIC_DIR } from "./app/index.js";
import { runtimeConfig } from "./config/runtime-config.js";
import { logger } from "./logger.js";
import { SessionStore } from "./sessions/session-store.js";
import { AuthService } from "./services/auth-service.js";
import { HighlightConfigService } from "./services/highlight-config-service.js";
import { PlanService } from "./services/plan-service.js";
import { SnippetService } from "./services/snippet-service.js";
import { TemplateService } from "./services/template-service.js";
import { UserService } from "./services/user-service.js";
import { JsonHighlightConfigStore } from "./stores/json-highlight-config-store.js";
import { JsonPlanStore } from "./stores/json-plan-store.js";
import { JsonSnippetStore } from "./stores/json-snippet-store.js";
import { JsonTemplateStore } from "./stores/json-template-store.js";
import { JsonUserStore } from "./stores/json-user-store.js";

// Pfadberechnung für statische Dateien. Wir leiten den Ordner relativ zu dieser
// Datei ab, damit der Server auch aus anderen Arbeitsverzeichnissen gestartet
// werden kann.
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_PATH = path.join(CURRENT_DIR, "..", "public");

function createServices(config, options = {}) {
  // Erstellt alle benötigten Daten-Stores und Services. Über optionale
  // Parameter lassen sich Test-Doubles einschleusen, sodass die Funktion leicht
  // in Tests nutzbar bleibt.
  const planStore = options.store ?? new JsonPlanStore();
  const templateStore = options.templateStore ?? new JsonTemplateStore();
  const snippetStore = options.snippetStore ?? new JsonSnippetStore();
  const highlightConfigStore = options.highlightConfigStore ?? new JsonHighlightConfigStore();
  const sessionStore =
    options.sessionStore ??
    new SessionStore({
      storageFile: path.join(config.paths.dataDir, "sessions.json"),
      defaultTtlMs: config.security.session.ttlMs,
    });
  const userStore = options.userStore ?? new JsonUserStore();

  const seedUsers = [];
  const userService = new UserService({
    store: userStore,
    defaults: seedUsers,
  });

  return {
    services: {
      planService: new PlanService({ store: planStore }),
      templateService: new TemplateService({ store: templateStore }),
      snippetService: new SnippetService({ store: snippetStore }),
      highlightConfigService: new HighlightConfigService({ store: highlightConfigStore }),
      authService: new AuthService(),
      sessionStore,
      planStore,
      templateStore,
      snippetStore,
      highlightConfigStore,
      userService,
    },
    stores: { planStore, templateStore, snippetStore, highlightConfigStore, sessionStore },
  };
}

function createServer(options = {}) {
  // Baut den HTTP-Server auf und verknüpft ihn mit der Express-ähnlichen App.
  // Alle Optionen lassen sich überschreiben, sodass Tests oder andere
  // Laufzeiten flexibel bleiben.
  const config = options.config ?? runtimeConfig;
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_PATH ?? DEFAULT_PUBLIC_DIR;

  const { services, stores } = createServices(config, options);
  const app = createApp({ config, services, publicDir });

  const server = createHttpServer((req, res) => {
    // Alle Anfragen werden an unsere App-Instanz weitergereicht.
    app.handle(req, res);
  });

  server.on("close", async () => {
    // Falls der Server regulär beendet wird, schließen wir alle Stores, damit
    // offene Dateien sauber freigegeben werden.
    await stores.planStore?.close?.();
    await stores.templateStore?.close?.();
    await stores.snippetStore?.close?.();
    await stores.highlightConfigStore?.close?.();
    await stores.sessionStore?.close?.();
  });

  const gracefulSignals = options.gracefulShutdownSignals ?? ["SIGTERM", "SIGINT"];
  for (const signal of gracefulSignals) {
    process.once(signal, async () => {
      // Graceful Shutdown: Bei Systemsignalen schließen wir den Server zuerst
      // für neue Verbindungen und räumen anschließend Ressourcen auf.
      logger.info("Schließe Server aufgrund von %s", signal);
      server.close();
      await stores.planStore?.close?.();
      await stores.templateStore?.close?.();
      await stores.snippetStore?.close?.();
      await stores.highlightConfigStore?.close?.();
      await stores.sessionStore?.close?.();
    });
  }

  return server;
}

class HttpApplication {
  constructor({ config, services, publicDir }) {
    // Hilfsklasse für Tests: Sie stellt die gleiche Oberfläche wie der echte
    // Server bereit, nutzt aber keinen eigenen HTTP-Port.
    const app = createApp({ config, services, publicDir });
    this.handle = app.handle;
    this.publicDir = publicDir ?? DEFAULT_PUBLIC_PATH ?? DEFAULT_PUBLIC_DIR;
    this.config = config;
    this.services = services;
  }
}

export { createServer, createServices, HttpApplication };
