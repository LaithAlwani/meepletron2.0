// Test-only resolve hook (`node --import ./scripts/resolveTs.mjs`): lets
// `--experimental-strip-types` load convex/ sources, whose relative imports are
// extensionless for the Convex bundler (e.g. `./bggThing`), by retrying a
// failed relative specifier with `.ts` appended.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) {
        throw err;
      }
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
