import { config } from "dotenv";
import { startUploadcareStub } from "./helpers/uploadcareStub.js";
import { createUploadFixtures } from "./fixtures/createUploadFixtures.js";

config({ path: ".env.test", quiet: true });
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Defina um TEST_DATABASE_URL exclusivo de avaliação");
// Configura antes de importar app/Prisma: não reutilizar DATABASE_URL de desenvolvimento.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.UPLOADCARE_PUBLIC_KEY = "demopublickey";
const stub = await startUploadcareStub(
  Number(process.env.EVALUATION_UPLOAD_PORT || 59314),
);
process.env.UPLOADCARE_TEST_BASE_URL = stub.url;
await createUploadFixtures();
const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/config/database.js");
const port = Number(process.env.EVALUATION_PORT || 59313);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `Avaliação API: http://127.0.0.1:${port}; provedor simulado: ${stub.url}`,
  ),
);

/** Encerra recursos da avaliação sem parar bancos ou processos preexistentes. */
async function close() {
  await new Promise((resolve) => server.close(resolve));
  await stub.close();
  await prisma.$disconnect();
}
process.once("SIGINT", close);
process.once("SIGTERM", close);