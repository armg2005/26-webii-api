//src/app.js
import express from "express";
import prisma from "./config/database.js";
import v1Routes from "./api/v1/routes/index.js";
// ADICIONADO: importa V2; os arquivos e o roteador da V1 permanecem intactos.
import v2Routes from "./api/v2/routes/index.js";
import errorHandler, { notFoundHandler } from "./middlewares/errorHandler.js";

const app = express();

app.use(express.json({ limit: "100kb" }));

/** Health check: preserva o contrato de monitoramento 200/503 da Aula 05. */
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: "OK",
      message: "API do Gerador de Provas",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      // MODIFICADO: anuncia V2 também, sem mudar o resultado 200/503.
      availableVersions: ["v1", "v2"],
      services: {
        api: "OK",
        database: { status: "OK" },
      },
    });
  } catch (error) {
    console.error("Erro na verificação do banco:", error);

    return res.status(503).json({
      status: "DEGRADED",
      message: "API do Gerador de Provas",
      version: "1.0.0",
      // MODIFICADO: anuncia V2 também, sem mudar o resultado 200/503.
      availableVersions: ["v1", "v2"],
      services: {
        api: "OK",
        database: { status: "ERROR" },
      },
    });
  }
});

app.use("/v1", v1Routes);
// ADICIONADO: monta somente a V2; não modifica nem deprecia a montagem V1.
app.use("/v2", v2Routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
