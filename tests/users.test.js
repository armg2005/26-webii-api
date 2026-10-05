import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/config/database.js";

const createdUserIds = [];
const createdSubjectIds = [];

/**
 * Gera um e-mail único para evitar colisões entre execuções dos testes.
 * @param {string} label - Identificador que facilita reconhecer o teste de origem.
 * @returns {string} E-mail único para uso temporário no banco de testes.
 */
function uniqueEmail(label) {
  return `aula06-${label}-${Date.now()}-${Math.random()}@example.com`;
}

/**
 * Cria um usuário pela API e registra o ID para a limpeza após o teste.
 * @param {object} [overrides={}] - Campos que substituem os valores padrão da requisição.
 * @returns {Promise<import("supertest").Response>} Resposta de `POST /v1/users`.
 */
async function createUser(overrides = {}) {
  const response = await request(app)
    .post("/v1/users")
    .send({
      nome: "Prof. Teste",
      email: uniqueEmail("user"),
      ...overrides,
    });

  if (response.status === 201) {
    createdUserIds.push(response.body.data.id);
  }

  return response;
}

/**
 * Confere o contrato comum das respostas de erro da API.
 * @param {import("supertest").Response} response - Resposta HTTP recebida.
 * @param {number} status - Status HTTP esperado.
 * @param {string} code - Código de erro esperado.
 * @returns {void}
 */
function expectApiError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe(code);
  expect(response.body.error.message).toEqual(expect.any(String));
  expect(response.body.timestamp).toEqual(expect.any(String));
  expect(response.body.path).toEqual(expect.any(String));
}

/** Remove dados temporários, respeitando primeiro os vínculos com matérias. */
afterEach(async () => {
  if (createdSubjectIds.length > 0) {
    await prisma.subject.deleteMany({
      where: { id: { in: createdSubjectIds.splice(0) } },
    });
  }

  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds.splice(0) } },
    });
  }
});

describe("User API com validação", () => {
  it.each([
    { nome: "  " },
    { nome: "x".repeat(101) },
    { nome: null },
    { email: "invalido" },
    { papel: "ALUNO" },
    { foto: "invalida" },
    { campoExtra: true },
  ])("rejeita cada campo inválido isoladamente: %j", async (overrides) => {
    const response = await createUser(overrides);
    expectApiError(response, 400, "VALIDATION_ERROR");
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it.each(["get", "patch", "delete"])(
    "valida ID em %s e preserva ausência real",
    async (method) => {
      const client = request(app);
      const created = await createUser();
      const id = created.body.data.id;
      await prisma.user.delete({ where: { id } });
      for (const invalidId of ["abc", "0", "-1", "1.5", "2147483648"]) {
        const response = await client[method](`/v1/users/${invalidId}`).send(
          method === "patch" ? { nome: "Novo nome" } : undefined,
        );
        expectApiError(response, 400, "VALIDATION_ERROR");
      }
      const missing = await client[method](`/v1/users/${id}`).send(
        method === "patch" ? { nome: "Novo nome" } : undefined,
      );
      expectApiError(missing, 404, "NOT_FOUND");
    },
  );

  it("preserva omissão e permite remover foto com null", async () => {
    const created = await createUser({
      nome: "ABC",
      foto: "https://example.com/foto.png",
      papel: "ADMIN",
    });
    const response = await request(app)
      .patch(`/v1/users/${created.body.data.id}`)
      .send({ foto: null });
    expect(response.status).toBe(200);
    expect(response.body.data.foto).toBeNull();
    expect(response.body.data.papel).toBe("ADMIN");
  });

  it("lista usuários e preserva o contrato de sucesso", async () => {
    const response = await request(app).get("/v1/users");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.total).toBe(response.body.data.length);
  });

  it("cria, transforma e normaliza um usuário sem expor campos internos", async () => {
    const email = uniqueEmail("create").toUpperCase();
    const response = await createUser({
      nome: "  Professora Ada  ",
      email: `  ${email}  `,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.nome).toBe("Professora Ada");
    expect(response.body.data.email).toBe(email.toLowerCase());
    expect(response.body.data).not.toHaveProperty("_count");
  });

  it("rejeita múltiplos erros de schema e campos extras", async () => {
    const response = await request(app).post("/v1/users").send({
      nome: "A",
      email: "email-inválido",
      papel: "ALUNO",
      inesperado: true,
    });

    expectApiError(response, 400, "VALIDATION_ERROR");
    expect(response.body.error.details.length).toBeGreaterThanOrEqual(4);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "nome" }),
        expect.objectContaining({ field: "email" }),
      ]),
    );
  });

  it("retorna conflito para e-mail duplicado", async () => {
    const email = uniqueEmail("duplicate");
    await createUser({ email });

    const response = await createUser({ email: email.toUpperCase() });

    expectApiError(response, 409, "CONFLICT");
  });

  it("valida o ID e informa a ausência de um usuário", async () => {
    const created = await createUser();
    const id = created.body.data.id;
    await prisma.user.delete({ where: { id } });
    const invalid = await request(app).get("/v1/users/abc");
    const missing = await request(app).get(`/v1/users/${id}`);

    expectApiError(invalid, 400, "VALIDATION_ERROR");
    expectApiError(missing, 404, "NOT_FOUND");
  });

  it("atualiza apenas os campos enviados e rejeita PATCH vazio", async () => {
    const created = await createUser({ nome: "Nome original" });
    const userId = created.body.data.id;
    const originalEmail = created.body.data.email;

    const updated = await request(app)
      .patch(`/v1/users/${userId}`)
      .send({ nome: "  Nome atualizado  " });
    const empty = await request(app).patch(`/v1/users/${userId}`).send({});

    expect(updated.status).toBe(200);
    expect(updated.body.data.nome).toBe("Nome atualizado");
    expect(updated.body.data.email).toBe(originalEmail);
    expectApiError(empty, 400, "VALIDATION_ERROR");
  });

  it("retorna conflito ao atualizar para o e-mail de outro usuário", async () => {
    const first = await createUser();
    const second = await createUser();

    const response = await request(app)
      .patch(`/v1/users/${second.body.data.id}`)
      .send({ email: first.body.data.email.toUpperCase() });

    expectApiError(response, 409, "CONFLICT");
  });

  it("remove usuário sem vínculos e mantém o contrato de ausência", async () => {
    const created = await createUser();
    const userId = created.body.data.id;

    const removed = await request(app).delete(`/v1/users/${userId}`);
    const found = await request(app).get(`/v1/users/${userId}`);

    expect(removed.status).toBe(200);
    expect(removed.body.data.id).toBe(userId);
    expectApiError(found, 404, "NOT_FOUND");
  });

  it("impede remover um usuário com matéria vinculada", async () => {
    const created = await createUser();
    const userId = created.body.data.id;
    const subject = await prisma.subject.create({
      data: { nome: "Matéria de teste", professorId: userId },
    });
    createdSubjectIds.push(subject.id);

    const response = await request(app).delete(`/v1/users/${userId}`);

    expectApiError(response, 409, "CONFLICT");
    expect(response.body.error.message).toContain("vinculadas");
  });

  it("padroniza rota inexistente", async () => {
    const response = await request(app).get("/rota-inexistente");

    expectApiError(response, 404, "NOT_FOUND");
    expect(response.body.path).toBe("/rota-inexistente");
  });

  it("não expõe detalhes internos em uma falha inesperada", async () => {
    const databaseError = new Error("segredo do banco não pode vazar");
    const findMany = vi
      .spyOn(prisma.user, "findMany")
      .mockRejectedValueOnce(databaseError);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await request(app).get("/v1/users");

      expectApiError(response, 500, "INTERNAL_ERROR");
      expect(response.body.error.message).not.toContain("segredo");
    } finally {
      findMany.mockRestore();
      consoleError.mockRestore();
    }
  });
});
