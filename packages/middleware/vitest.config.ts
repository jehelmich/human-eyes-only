import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Tests run against core's source, not its build output. Otherwise `pnpm
      // test` silently depends on `pnpm build` having run first, which is a
      // green suite against stale code waiting to happen — and CI does not
      // build before testing.
      "@human-eyes-only/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
});
