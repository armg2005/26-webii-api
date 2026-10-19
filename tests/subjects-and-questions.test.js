import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/config/database.js";

const userIds = [];
const subjectIds = [];
const questionIds = [];

/**
 * Gera e-mail único para cada fixture de teste.
 * @param {string} label - Identificador do cenário que cria o e-mail.
 * @returns {string} E-mail único para um usuário temporário.
 */
function email(label) {
  return `aula06-${label}-${Date.now()}-${Math.random()}@exemplo.com`;
}

/**
 * Cria um usuário válido e registra seu ID para limpeza.
 * @param {object} [overrides={}] - Campos que substituem os dados padrão.
 * @returns {Promise<object>} Usuário criado pela API.
 */
async function createUser(overrides = {}) {
  const response = await request(app)
    .post("/v1/users")
    .send({
      nome: "Professor de teste",
      email: email("professor"),
      ...overrides,
    });

  expect(response.status).toBe(201);
  userIds.push(response.body.data.id);
  return response.body.data;
}

/**
 * Cria uma matéria válida e registra seu ID para limpeza.
 * @param {number} professorId - Professor responsável pela matéria.
 * @param {object} [overrides={}] - Campos que substituem os dados padrão.
 * @returns {Promise<object>} Matéria criada pela API.
 */
async function createSubject(professorId, overrides = {}) {
  const response = await request(app)
    .post("/v1/subjects")
    .send({ nome: "Programação Web", professorId, ...overrides });

  expect(response.status).toBe(201);
  subjectIds.push(response.body.data.id);
  return response.body.data;
}

/**
 * Cria uma questão válida e registra seu ID para limpeza.
 * @param {number} subjectId - Matéria associada à questão.
 * @param {number} authorId - Autor da questão.
 * @param {object} [overrides={}] - Campos que substituem os dados padrão.
 * @returns {Promise<object>} Questão criada pela API.
 */
async function createQuestion(subjectId, authorId, overrides = {}) {
  const response = await request(app)
    .post("/v1/questions")
    .send({
      enunciado: "O que é uma API REST?",
      dificuldade: 2,
      respostaCorreta: "Uma API baseada nas restrições de REST.",
      subjectId,
      authorId,
      ...overrides,
    });

  expect(response.status).toBe(201);
  questionIds.push(response.body.data.id);
  return response.body.data;
}

/**
 * Confere o formato comum de uma resposta de erro.
 * @param {import("supertest").Response} response - Resposta HTTP recebida.
 * @param {number} status - Status HTTP esperado.
 * @param {string} code - Código de erro esperado.
 * @returns {void}
 */
function expectApiError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe(code);
  expect(response.body.timestamp).toEqual(expect.any(String));
  expect(response.body.path).toEqual(expect.any(String));
}

/**
 * Reserva um ID realmente inexistente criando e removendo uma fixture sem vínculos.
 * @returns {Promise<number>} ID que não pertence a outro usuário.
 */
async function missingUserId() {
  const user = await createUser();
  await prisma.user.delete({ where: { id: user.id } });
  return user.id;
}

/** Remove fixtures na ordem questão → matéria → usuário. */
afterEach(async () => {
  await prisma.question.deleteMany({
    where: { id: { in: questionIds.splice(0) } },
  });
  await prisma.subject.deleteMany({
    where: { id: { in: subjectIds.splice(0) } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
});

describe("Subject API com validação", () => {
  it.each([
    { nome: "x".repeat(101) },
    { nome: null },
    { professorId: 0 },
    { professorId: true },
    { professorId: [1] },
    { professorId: 2147483648 },
    { ativa: "false" },
    { campoExtra: true },
  ])(
    "rejeita campo isolado em POST e PATCH de matéria: %j",
    async (invalid) => {
      const professor = await createUser();
      const subject = await createSubject(professor.id);
      const post = await request(app)
        .post("/v1/subjects")
        .send({
          nome: "Matéria válida",
          professorId: professor.id,
          ...invalid,
        });
      if (post.status === 201) subjectIds.push(post.body.data.id);
      const patch = await request(app)
        .patch(`/v1/subjects/${subject.id}`)
        .send(invalid);
      expectApiError(post, 400, "VALIDATION_ERROR");
      expectApiError(patch, 400, "VALIDATION_ERROR");
    },
  );

  it.each(["get", "patch", "delete"])(
    "valida parâmetros e ausência de matéria em %s",
    async (method) => {
      const client = request(app);
      const professor = await createUser();
      const subject = await createSubject(professor.id);
      await prisma.subject.delete({ where: { id: subject.id } });
      for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
        const invalid = await client[method](`/v1/subjects/${id}`).send(
          method === "patch" ? { nome: "Novo nome" } : undefined,
        );
        expectApiError(invalid, 400, "VALIDATION_ERROR");
      }
      const missing = await client[method](`/v1/subjects/${subject.id}`).send(
        method === "patch" ? { nome: "Novo nome" } : undefined,
      );
      expectApiError(missing, 404, "NOT_FOUND");
    },
  );

  it("aceita limites, professor em texto decimal e ativa false", async () => {
    const professor = await createUser();
    const subject = await createSubject(String(professor.id), {
      nome: "x".repeat(100),
      ativa: false,
    });
    expect(subject.nome).toHaveLength(100);
    expect(subject.ativa).toBe(false);
  });
  it("rejeita corpo inválido, campo extra e parâmetro inválido", async () => {
    const invalidBody = await request(app).post("/v1/subjects").send({
      nome: " ",
      professorId: "invalido",
      inesperado: true,
    });
    const invalidId = await request(app).get("/v1/subjects/abc");

    expectApiError(invalidBody, 400, "VALIDATION_ERROR");
    expect(invalidBody.body.error.details.length).toBeGreaterThan(1);
    expectApiError(invalidId, 400, "VALIDATION_ERROR");
  });

  it("retorna erro padronizado quando o professor não existe", async () => {
    const response = await request(app)
      .post("/v1/subjects")
      .send({
        nome: "Matéria sem professor",
        professorId: await missingUserId(),
      });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("cria, lista e busca uma matéria com professor", async () => {
    const professor = await createUser();
    const subject = await createSubject(professor.id);

    const list = await request(app).get("/v1/subjects");
    const found = await request(app).get(`/v1/subjects/${subject.id}`);

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(list.body.data.length);
    expect(list.body.data.some((item) => item.id === subject.id)).toBe(true);
    expect(found.status).toBe(200);
    expect(found.body.data.professor.id).toBe(professor.id);
  });

  it("transforma nome, preserva campos e valida professor na atualização", async () => {
    const professor = await createUser();
    const subject = await createSubject(professor.id, { ativa: true });

    const updated = await request(app)
      .patch(`/v1/subjects/${subject.id}`)
      .send({ nome: "  Banco de Dados  " });
    const missingProfessor = await request(app)
      .patch(`/v1/subjects/${subject.id}`)
      .send({ professorId: await missingUserId() });

    expect(updated.status).toBe(200);
    expect(updated.body.data.nome).toBe("Banco de Dados");
    expect(updated.body.data.ativa).toBe(true);
    expect(updated.body.data.professor.id).toBe(professor.id);
    expectApiError(missingProfessor, 404, "NOT_FOUND");
  });

  it("rejeita PATCH vazio e campos não permitidos", async () => {
    const professor = await createUser();
    const subject = await createSubject(professor.id);

    const empty = await request(app)
      .patch(`/v1/subjects/${subject.id}`)
      .send({});
    const extra = await request(app)
      .patch(`/v1/subjects/${subject.id}`)
      .send({ inesperado: true });

    expectApiError(empty, 400, "VALIDATION_ERROR");
    expectApiError(extra, 400, "VALIDATION_ERROR");
  });

  it("remove matéria sem questões e padroniza a ausência posterior", async () => {
    const professor = await createUser();
    const subject = await createSubject(professor.id);

    const removed = await request(app).delete(`/v1/subjects/${subject.id}`);
    const found = await request(app).get(`/v1/subjects/${subject.id}`);

    expect(removed.status).toBe(200);
    expect(removed.body.data.id).toBe(subject.id);
    expectApiError(found, 404, "NOT_FOUND");
  });

  it("impede remover matéria com questão vinculada", async () => {
    const professor = await createUser();
    const subject = await createSubject(professor.id);
    await createQuestion(subject.id, professor.id);

    const response = await request(app).delete(`/v1/subjects/${subject.id}`);

    expectApiError(response, 409, "CONFLICT");
  });
});

describe("Question API com validação", () => {
  it.each([
    { enunciado: "  " },
    { enunciado: "x".repeat(501) },
    { dificuldade: 0 },
    { dificuldade: 4 },
    { dificuldade: 1.5 },
    { dificuldade: true },
    { dificuldade: [1] },
    { respostaCorreta: "  " },
    { respostaCorreta: "x".repeat(501) },
    { subjectId: 0 },
    { authorId: true },
    { authorId: [1] },
    { subjectId: 2147483648 },
    { ativa: "false" },
    { campoExtra: true },
  ])(
    "rejeita campo isolado em POST e PATCH de questão: %j",
    async (invalid) => {
      const author = await createUser();
      const subject = await createSubject(author.id);
      const question = await createQuestion(subject.id, author.id);
      const post = await request(app)
        .post("/v1/questions")
        .send({
          enunciado: "Questão válida",
          dificuldade: 2,
          subjectId: subject.id,
          authorId: author.id,
          ...invalid,
        });
      if (post.status === 201) questionIds.push(post.body.data.id);
      const patch = await request(app)
        .patch(`/v1/questions/${question.id}`)
        .send(invalid);
      expectApiError(post, 400, "VALIDATION_ERROR");
      expectApiError(patch, 400, "VALIDATION_ERROR");
    },
  );

  it.each(["get", "patch", "delete"])(
    "valida ID de questão em %s",
    async (method) => {
      const client = request(app);
      for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
        const response = await client[method](`/v1/questions/${id}`).send(
          method === "patch" ? { dificuldade: 2 } : undefined,
        );
        expectApiError(response, 400, "VALIDATION_ERROR");
      }
    },
  );

  it("aceita limites, texto decimal, resposta nula e ativa false", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(
      String(subject.id),
      String(author.id),
      {
        enunciado: "x".repeat(500),
        dificuldade: "3",
        respostaCorreta: null,
        ativa: false,
      },
    );
    expect(question.enunciado).toHaveLength(500);
    expect(question.dificuldade).toBe(3);
    expect(question.respostaCorreta).toBeNull();
    expect(question.ativa).toBe(false);
  });

  it("confere matéria no POST e autor no PATCH usando IDs removidos", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(subject.id, author.id);
    const removed = await createSubject(author.id);
    await prisma.subject.delete({ where: { id: removed.id } });
    const post = await request(app).post("/v1/questions").send({
      enunciado: "Questão válida",
      dificuldade: 1,
      subjectId: removed.id,
      authorId: author.id,
    });
    const patch = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({ authorId: await missingUserId() });
    expectApiError(post, 404, "NOT_FOUND");
    expectApiError(patch, 404, "NOT_FOUND");
  });
  it("rejeita corpo inválido, campo extra e autor inexistente", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);

    const invalid = await request(app).post("/v1/questions").send({
      enunciado: "Questão válida",
      dificuldade: 4,
      subjectId: subject.id,
      authorId: author.id,
      inesperado: true,
    });
    const missingAuthor = await request(app)
      .post("/v1/questions")
      .send({
        enunciado: "Questão válida",
        dificuldade: 1,
        subjectId: subject.id,
        authorId: await missingUserId(),
      });

    expectApiError(invalid, 400, "VALIDATION_ERROR");
    expectApiError(missingAuthor, 404, "NOT_FOUND");
  });

  it("cria, lista e busca uma questão com matéria e autor", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(subject.id, author.id);

    const list = await request(app).get("/v1/questions");
    const found = await request(app).get(`/v1/questions/${question.id}`);

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(list.body.data.length);
    expect(list.body.data.some((item) => item.id === question.id)).toBe(true);
    expect(found.status).toBe(200);
    expect(found.body.data.subject.id).toBe(subject.id);
    expect(found.body.data.author.id).toBe(author.id);
  });

  it("transforma enunciado e aceita resposta nula em atualização parcial", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(subject.id, author.id, {
      dificuldade: 1,
      ativa: true,
    });

    const response = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({ enunciado: "  O que é REST?  ", respostaCorreta: null });

    expect(response.status).toBe(200);
    expect(response.body.data.enunciado).toBe("O que é REST?");
    expect(response.body.data.respostaCorreta).toBeNull();
    expect(response.body.data.dificuldade).toBe(1);
    expect(response.body.data.ativa).toBe(true);
  });

  it("valida dificuldade, IDs, PATCH vazio, campos extras e relações", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(subject.id, author.id);
    const missingSubject = await createSubject(author.id);
    await prisma.subject.delete({ where: { id: missingSubject.id } });

    const invalidDifficulty = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({ dificuldade: 4 });
    const invalidId = await request(app)
      .patch("/v1/questions/abc")
      .send({ dificuldade: 2 });
    const empty = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({});
    const extra = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({ inesperado: true });
    const missingRelation = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({ subjectId: missingSubject.id });

    expectApiError(invalidDifficulty, 400, "VALIDATION_ERROR");
    expectApiError(invalidId, 400, "VALIDATION_ERROR");
    expectApiError(empty, 400, "VALIDATION_ERROR");
    expectApiError(extra, 400, "VALIDATION_ERROR");
    expectApiError(missingRelation, 404, "NOT_FOUND");
  });

  it("remove uma questão e padroniza a ausência posterior", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(subject.id, author.id);

    const removed = await request(app).delete(`/v1/questions/${question.id}`);
    const found = await request(app).get(`/v1/questions/${question.id}`);

    expect(removed.status).toBe(200);
    expect(removed.body.data.id).toBe(question.id);
    expectApiError(found, 404, "NOT_FOUND");
  });

  it("retorna erro padronizado para questão inexistente", async () => {
    const author = await createUser();
    const subject = await createSubject(author.id);
    const question = await createQuestion(subject.id, author.id);
    await prisma.question.delete({ where: { id: question.id } });
    const update = await request(app)
      .patch(`/v1/questions/${question.id}`)
      .send({ dificuldade: 2 });
    const remove = await request(app).delete(`/v1/questions/${question.id}`);

    expectApiError(update, 404, "NOT_FOUND");
    expectApiError(remove, 404, "NOT_FOUND");
  });
});

describe("Contrato global de erro", () => {
  it("padroniza a rota inexistente", async () => {
    const response = await request(app).get("/rota-inexistente");

    expectApiError(response, 404, "NOT_FOUND");
  });
});
