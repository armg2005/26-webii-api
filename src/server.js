import "dotenv/config";
import app from "./app.js";
import prisma from "./config/database.js";

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
  console.log("Health check: http://localhost:" + PORT + "/health");
  console.log("API v1: http://localhost:" + PORT + "/v1");
  console.log("Usuários v1: http://localhost:" + PORT + "/v1/users");
});

/**
 * Encerra o servidor HTTP e libera a conexão com o banco.
 * @param {string} signal - Sinal recebido pelo processo.
 * @returns {Promise<void>} Encerramento solicitado.
 */
async function shutdown(signal) {
  console.log("Recebido " + signal + ". Encerrando...");

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
