import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/config/database.js";

const userIds = [];

/**
 * Gera e-mail único para cada fixture.
 * @param {string} label - Identificador do cenário.
 * @returns {string} E-mail único.
 */
function email(label) {
  return `aula08-${label}-${Date.now()}-${Math.random()}@exemplo.com`;
}

/** Cria um usuário pelo contrato V1 (legado) e registra o ID. */
async function createV1(overrides = {}) {
  const response = await request(app)
    .post("/v1/users")
    .send({ nome: "Usuário Legado", email: email("v1"), ...overrides });

  expect(response.status).toBe(201);
  userIds.push(response.body.data.id);
  return response.body.data;
}

/** Cria um usuário pelo contrato V2 e registra o ID. */
async function createV2(overrides = {}) {
  const response = await request(app)
    .post("/v2/users")
    .send({
      primeiroNome: "Maria",
      sobrenome: "Souza",
      email: email("v2"),
      ...overrides,
    });

  expect(response.status).toBe(201);
  userIds.push(response.body.data.id);
  return response.body.data;
}

/** Confere o contrato padrão de erro da API. */
function expectApiError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe(code);
  expect(response.body.timestamp).toEqual(expect.any(String));
  expect(response.body.path).toEqual(expect.any(String));
}

/** Garante um ID de usuário realmente inexistente. */
async function missingUserId() {
  const user = await createV1();
  await prisma.user.delete({ where: { id: user.id } });
  userIds.splice(userIds.indexOf(user.id), 1);
  return user.id;
}

afterEach(async () => {
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  }
});

describe("User V2 — validação", () => {
  it.each([
    { primeiroNome: "A" },
    { primeiroNome: null },
    { sobrenome: "B" },
    { email: "invalido" },
    { tipoUsuario: "ALUNO" },
    { telefone: "123" },
    { telefone: "123456789012" },
    { foto: "não-é-url" },
    { campoExtra: true },
  ])("rejeita campo isolado em POST: %j", async (invalid) => {
    const response = await request(app)
      .post("/v2/users")
      .send({
        primeiroNome: "Maria",
        sobrenome: "Souza",
        email: email("invalid"),
        ...invalid,
      });

    expectApiError(response, 400, "VALIDATION_ERROR");
  });

  it("rejeita POST sem primeiroNome, sobrenome ou email", async () => {
    const response = await request(app).post("/v2/users").send({});
    expectApiError(response, 400, "VALIDATION_ERROR");
    expect(response.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it("rejeita PATCH vazio e campos extras", async () => {
    const user = await createV2();

    const empty = await request(app).patch(`/v2/users/${user.id}`).send({});
    const extra = await request(app)
      .patch(`/v2/users/${user.id}`)
      .send({ inesperado: true });

    expectApiError(empty, 400, "VALIDATION_ERROR");
    expectApiError(extra, 400, "VALIDATION_ERROR");
  });

  it.each(["get", "patch", "delete"])(
    "valida parâmetros e ausência de usuário em %s",
    async (method) => {
      const client = request(app);
      const missingId = await missingUserId();

      for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
        const invalid = await client[method](`/v2/users/${id}`).send(
          method === "patch" ? { telefone: "11999999999" } : undefined,
        );
        expectApiError(invalid, 400, "VALIDATION_ERROR");
      }

      const missing = await client[method](`/v2/users/${missingId}`).send(
        method === "patch" ? { telefone: "11999999999" } : undefined,
      );
      expectApiError(missing, 404, "NOT_FOUND");
    },
  );
});

describe("User V2 — normalização e padrões", () => {
  it("normaliza espaços/e-mail, aplica tipoUsuario padrão e não expõe nome/papel", async () => {
    const userEmail = email("normaliza").toUpperCase();
    const response = await request(app)
      .post("/v2/users")
      .send({
        primeiroNome: "  Maria  ",
        sobrenome: "  Souza  ",
        email: `  ${userEmail}  `,
      });

    expect(response.status).toBe(201);
    userIds.push(response.body.data.id);

    expect(response.body.data.primeiroNome).toBe("Maria");
    expect(response.body.data.sobrenome).toBe("Souza");
    expect(response.body.data.email).toBe(userEmail.toLowerCase());
    expect(response.body.data.tipoUsuario).toBe("professor");
    expect(response.body.data.telefone).toBeNull();
    expect(response.body.data.foto).toBeNull();
    expect(response.body.data).not.toHaveProperty("nome");
    expect(response.body.data).not.toHaveProperty("papel");
  });

  it("aceita tipoUsuario admin, telefone e foto explícitos", async () => {
    const user = await createV2({
      tipoUsuario: "admin",
      telefone: "11999999999",
      foto: "https://example.com/foto.png",
    });

    expect(user.tipoUsuario).toBe("admin");
    expect(user.telefone).toBe("11999999999");
  });

  it("retorna conflito de e-mail entre V1 e V2 (mesma tabela)", async () => {
    const userEmail = email("conflito");
    await createV1({ email: userEmail });

    const response = await request(app).post("/v2/users").send({
      primeiroNome: "Outro",
      sobrenome: "Usuário",
      email: userEmail.toUpperCase(),
    });

    expectApiError(response, 409, "CONFLICT");
  });
});

describe("User V2 — sincronização V2 → V1", () => {
  it("usuário criado pela V2 é lido corretamente pela V1", async () => {
    const user = await createV2({
      primeiroNome: "João",
      sobrenome: "Santos",
      tipoUsuario: "admin",
    });

    const foundV1 = await request(app).get(`/v1/users/${user.id}`);

    expect(foundV1.status).toBe(200);
    expect(foundV1.body.data.nome).toBe("João Santos");
    expect(foundV1.body.data.papel).toBe("ADMIN");
  });

  it("PATCH só de e-mail preserva nome/papel equivalentes na V1", async () => {
    const user = await createV2({ primeiroNome: "Carla", sobrenome: "Lima" });

    const updated = await request(app)
      .patch(`/v2/users/${user.id}`)
      .send({ email: email("patch-email") });

    expect(updated.status).toBe(200);
    expect(updated.body.data.primeiroNome).toBe("Carla");

    const foundV1 = await request(app).get(`/v1/users/${user.id}`);
    expect(foundV1.body.data.nome).toBe("Carla Lima");
  });

  it("PATCH de sobrenome atualiza o nome equivalente na V1", async () => {
    const user = await createV2({ primeiroNome: "Pedro", sobrenome: "Alves" });

    await request(app)
      .patch(`/v2/users/${user.id}`)
      .send({ sobrenome: "Costa" });

    const foundV1 = await request(app).get(`/v1/users/${user.id}`);
    expect(foundV1.body.data.nome).toBe("Pedro Costa");
  });

  it("PATCH de tipoUsuario sincroniza o papel equivalente na V1", async () => {
    const user = await createV2();

    await request(app)
      .patch(`/v2/users/${user.id}`)
      .send({ tipoUsuario: "admin" });

    const foundV1 = await request(app).get(`/v1/users/${user.id}`);
    expect(foundV1.body.data.papel).toBe("ADMIN");
  });

  it("PATCH com telefone null remove o telefone sem apagar outros campos", async () => {
    const user = await createV2({ telefone: "11999999999" });

    const updated = await request(app)
      .patch(`/v2/users/${user.id}`)
      .send({ telefone: null });

    expect(updated.status).toBe(200);
    expect(updated.body.data.telefone).toBeNull();
    expect(updated.body.data.primeiroNome).toBe(user.primeiroNome);
  });

  it("DELETE devolve a representação V2 adaptada, mesmo de um usuário legado", async () => {
    const user = await createV1({ nome: "Usuário Para Remover" });

    const removed = await request(app).delete(`/v2/users/${user.id}`);

    expect(removed.status).toBe(200);
    expect(removed.body.data.primeiroNome).toBe("Usuário");
    expect(removed.body.data.sobrenome).toBe("Para Remover");
    expect(removed.body.data).not.toHaveProperty("nome");

    const foundV1 = await request(app).get(`/v1/users/${user.id}`);
    expectApiError(foundV1, 404, "NOT_FOUND");
  });

  it("impede remover um usuário com matéria vinculada", async () => {
    const user = await createV2();
    const subject = await prisma.subject.create({
      data: { nome: "Matéria vinculada", professorId: user.id },
    });

    const response = await request(app).delete(`/v2/users/${user.id}`);
    expectApiError(response, 409, "CONFLICT");

    await prisma.subject.delete({ where: { id: subject.id } });
  });
});

describe("User V2 — leitura adaptada de usuários legados", () => {
  it("deriva primeiroNome/sobrenome/tipoUsuario de um monônimo legado, sem persistir", async () => {
    const legacy = await createV1({ nome: "Madonna", papel: "ADMIN" });

    const found = await request(app).get(`/v2/users/${legacy.id}`);

    expect(found.status).toBe(200);
    expect(found.body.data.primeiroNome).toBe("Madonna");
    expect(found.body.data.sobrenome).toBeNull();
    expect(found.body.data.tipoUsuario).toBe("admin");

    const raw = await prisma.user.findUnique({ where: { id: legacy.id } });
    expect(raw.primeiroNome).toBeNull();
    expect(raw.sobrenome).toBeNull();
    expect(raw.tipoUsuario).toBeNull();
  });

  it("colapsa espaços internos de um nome legado ao separar as partes", async () => {
    const legacy = await createV1({ nome: "  Ana   Maria   Silva  " });

    const found = await request(app).get(`/v2/users/${legacy.id}`);

    expect(found.body.data.primeiroNome).toBe("Ana");
    expect(found.body.data.sobrenome).toBe("Maria Silva");
  });

  it("a listagem V2 também adapta usuários legados sem persistir", async () => {
    const legacy = await createV1({ nome: "Legado Listado" });

    const list = await request(app).get("/v2/users");
    const found = list.body.data.find((item) => item.id === legacy.id);

    expect(found).toBeDefined();
    expect(found.primeiroNome).toBe("Legado");
    expect(found.sobrenome).toBe("Listado");
  });

  it('documenta a divergência conhecida: PATCH de "nome" pela V1 não sincroniza com a V2', async () => {
    const user = await createV2({ primeiroNome: "Ana", sobrenome: "Silva" });

    await request(app)
      .patch(`/v1/users/${user.id}`)
      .send({ nome: "Ana Costa" });

    const foundV1 = await request(app).get(`/v1/users/${user.id}`);
    expect(foundV1.body.data.nome).toBe("Ana Costa");

    const foundV2 = await request(app).get(`/v2/users/${user.id}`);
    // Limitação documentada no passo 4.2 da aula: o campo V2 já
    // preenchido ("Silva") prevalece sobre o fallback, não é um bug.
    expect(foundV2.body.data.sobrenome).toBe("Silva");
  });
});
