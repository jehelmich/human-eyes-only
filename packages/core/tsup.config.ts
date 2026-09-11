import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // The package tsconfig is a composite project reference, which the declaration
  // bundler cannot consume directly; it needs a plain program.
  dts: { compilerOptions: { composite: false, incremental: false } },
  clean: true,
  target: "node20",
});
