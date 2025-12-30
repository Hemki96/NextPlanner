import { buildRouters } from "../../routes/index.js";

function createRouterPipeline({ services, publicDir }) {
  const routers = buildRouters({ services, publicDir });
  return async function routeRequest(ctx) {
    for (const router of routers) {
      // eslint-disable-next-line no-await-in-loop
      const handled = await router(ctx);
      if (handled) {
        return true;
      }
    }
    return false;
  };
}

export { createRouterPipeline };
