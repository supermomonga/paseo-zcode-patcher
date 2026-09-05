import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/artifact.test.ts"],
  },
});
