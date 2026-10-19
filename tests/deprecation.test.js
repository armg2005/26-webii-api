// MODIFICADO: testa o middleware compartilhado sem alterar a aplicação real.
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createDeprecationMiddleware } from "../src/middlewares/deprecation.js";

describe("Prática — depreciação preparada", () => {
  it("permanece desativada sem uma data explícita", async () => {
    const app = express();
    app.use(createDeprecationMiddleware());
    app.get("/", (_req, res) => res.sendStatus(200));
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.headers).not.toHaveProperty("deprecation");
    expect(response.headers).not.toHaveProperty("sunset");
  });

  it("emite data estruturada, data HTTP e link ao receber política", async () => {
    const app = express();
    const deprecatedAt = new Date("2030-01-01T00:00:00Z");
    const sunset = new Date("2030-07-01T00:00:00Z");
    app.use(
      createDeprecationMiddleware({
        deprecatedAt,
        sunset,
        link: "https://example.com/migracao",
      }),
    );
    app.get("/", (_req, res) => res.sendStatus(200));
    const response = await request(app).get("/");
    expect(response.headers.deprecation).toBe(
      `@${deprecatedAt.getTime() / 1000}`,
    );
    expect(response.headers.sunset).toBe(sunset.toUTCString());
    expect(response.headers.link).toBe(
      '<https://example.com/migracao>; rel="deprecation"',
    );
  });
});
