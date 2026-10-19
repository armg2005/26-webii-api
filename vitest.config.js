import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// A suíte nunca utiliza silenciosamente DATABASE_URL do .env de desenvolvimento.
config({ path: ".env.test", quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Defina TEST_DATABASE_URL em .env.test apontando para um banco exclusivo de testes.",
  );
}

export default defineConfig({
  test: {
    environment: "node",
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL },
    fileParallelism: false,
    testTimeout: 15000, // <-- Linha adicionada aqui (15 segundos)
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/server.js"],
    },
  },
});