import { defineConfig } from "vitest/config";

// The comparison engine's parseInstances() uses the browser DOMParser, so the
// tests run in a jsdom environment that provides DOMParser/window.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
