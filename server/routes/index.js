import { createAuthRouter } from "./auth.js";
import { createBackupsRouter } from "./backups.js";
import { createHighlightConfigRouter } from "./highlight-config.js";
import { createHealthRouter } from "./health.js";
import { createPlansRouter } from "./plans.js";
import { createSnippetsRouter } from "./snippets.js";
import { createTemplatesRouter } from "./templates.js";
import { createUsersRouter } from "./users.js";
import { createStaticRouter } from "./static.js";

function buildRouters({ services, publicDir }) {
  return [
    createHealthRouter({ services }),
    createAuthRouter({ authService: services.authService }),
    createPlansRouter({ planService: services.planService }),
    createTemplatesRouter({ templateService: services.templateService }),
    createSnippetsRouter({ snippetService: services.snippetService }),
    createHighlightConfigRouter({ highlightConfigService: services.highlightConfigService }),
    createBackupsRouter({ planService: services.planService }),
    createUsersRouter({ userService: services.userService }),
    createStaticRouter({ publicDir }),
  ];
}

export { buildRouters };
