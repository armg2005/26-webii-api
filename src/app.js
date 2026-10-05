//src/app.js
import express from "express";
import prisma from "./config/database.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import errorHandler, { notFoundHandler } from "./middlewares/errorHandler.js";
import v1Routes from "./api/v1/routes/index.js";

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
    availableVersions: ["v1"],
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
      services: {
        api: "OK",
        database: { status: "ERROR" },
      },
    });
  }
});

app.use("/v1", v1Routes);
app.use("/subjects", subjectRoutes);
app.use("/questions", questionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
