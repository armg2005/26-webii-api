import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import app from "../src/app.js";
import prisma from "../src/config/database.js";
import validate from "../src/middlewares/validate.js";
import errorHandler from "../src/middlewares/errorHandler.js";

/** Restaura somente os mocks usados pelo cenário atual. */
afterEach(() => vi.restoreAllMocks());

describe("Infraestrutura e pipeline HTTP", () => {
  it("rejeita JSON malformado com 400 sem revelar o corpo", async () => {
    const response = await request(app)
      .post("/v1/users")
      .set("Content-Type", "application/json")
      .send('{"segredo":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details[0].field).toBe("body");
    expect(JSON.stringify(response.body)).not.toContain("segredo");
  });

  it("rejeita corpos acima de 100 KB com 413", async () => {
    const response = await request(app)
      .post("/v1/users")
      .send({ nome: "x".repeat(110000) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(response.body.success).toBe(false);
    expect(response.body.path).toBe("/v1/users");
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  it("disponibiliza query parseada em res.locals sem alterar req.query", async () => {
    const probe = express();
    probe.get(
      "/probe",
      validate(z.object({ page: z.coerce.number().int().positive() }), "query"),
      (req, res) =>
        res.json({ parsed: res.locals.query.page, original: req.query.page }),
    );
    probe.use(errorHandler);
    const valid = await request(probe).get("/probe?page=2");
    const invalid = await request(probe).get("/probe?page=abc");
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ parsed: 2, original: "2" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("preserva o contrato de health com banco disponível", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("OK");
    expect(response.body.services.database.status).toBe("OK");
  });

  it("preserva health 503 e oculta detalhes da indisponibilidade", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
      new Error("senha-interna"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(app).get("/health");
    expect(response.status).toBe(503);
    expect(response.body.status).toBe("DEGRADED");
    expect(response.body.services.database.status).toBe("ERROR");
    expect(JSON.stringify(response.body)).not.toContain("senha-interna");
  });

  it("delega ao Express quando a resposta já começou", () => {
    const error = new Error("falha tardia");
    const next = vi.fn();
    errorHandler(error, {}, { headersSent: true }, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("traduz P2002 sem expor metadados do banco", async () => {
    vi.spyOn(prisma.user, "findMany").mockRejectedValueOnce({
      code: "P2002",
      meta: { secret: true },
    });
    const response = await request(app).get("/v1/users");
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });
  it("expõe o health da V1", async () => {
  const response = await request(app).get("/v1/health");

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ version: "v1", status: "OK" });
});

it("rejeita a rota de usuário sem versão", async () => {
  const response = await request(app).get("/users");

  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe("NOT_FOUND");
  expect(response.body.error.hint).toContain("/v1");
});
});
