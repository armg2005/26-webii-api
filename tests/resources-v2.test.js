import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/config/database.js";

const userIds = [];
const subjectIds = [];
const questionIds = [];

/**
 * Gera e-mail único para cada fixture.
 * @param {string} label - Identificador do cenário.
 * @returns {string} E-mail único.
 */
function email(label) {
  return `aula08-res-${label}-${Date.now()}-${Math.random()}@exemplo.com`;
}

/** Cria um usuário direto pelo Prisma (fixture independente das rotas). */
async function createUserFixture(overrides = {}) {
  const user = await prisma.user.create({
    data: { nome: "Professor Fixture", email: email("user"), ...overrides },
  });
  userIds.push(user.id);
  return user;
}

/** Cria uma matéria direto pelo Prisma. */
async function createSubjectFixture(professorId, overrides = {}) {
  const subject = await prisma.subject.create({
    data: { nome: "Matéria Fixture", professorId, ...overrides },
  });
  subjectIds.push(subject.id);
  return subject;
}

/** Cria uma questão direto pelo Prisma. */
async function createQuestionFixture(subjectId, authorId, overrides = {}) {
  const question = await prisma.question.create({
    data: {
      enunciado: "Enunciado fixture",
      dificuldade: 2,
      subjectId,
      authorId,
      ...overrides,
    },
  });
  questionIds.push(question.id);
  return question;
}

/** Confere o contrato padrão de erro da API. */
function expectApiError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe(code);
  expect(response.body.timestamp).toEqual(expect.any(String));
  expect(response.body.path).toEqual(expect.any(String));
}

/** Garante um ID de matéria realmente inexistente. */
async function missingSubjectId(professorId) {
  const subject = await createSubjectFixture(professorId);
  await prisma.subject.delete({ where: { id: subject.id } });
  subjectIds.splice(subjectIds.indexOf(subject.id), 1);
  return subject.id;
}

/** Garante um ID de usuário realmente inexistente. */
async function missingUserId() {
  const user = await createUserFixture();
  await prisma.user.delete({ where: { id: user.id } });
  userIds.splice(userIds.indexOf(user.id), 1);
  return user.id;
}

/** Remove fixtures na ordem questão → matéria → usuário. */
afterEach(async () => {
  if (questionIds.length > 0) {
    await prisma.question.deleteMany({
      where: { id: { in: questionIds.splice(0) } },
    });
  }
  if (subjectIds.length > 0) {
    await prisma.subject.deleteMany({
      where: { id: { in: subjectIds.splice(0) } },
    });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  }
});

describe("Subject V2 — CRUD e contrato", () => {
  it("cria, lista (ativas e inativas) e busca uma matéria com professor aninhado", async () => {
    const professor = await createUserFixture();

    const created = await request(app)
      .post("/v2/subjects")
      .send({
        nome: "Banco de Dados",
        professorId: professor.id,
        ativa: false,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.ativa).toBe(false);
    subjectIds.push(created.body.data.id);

    const list = await request(app).get("/v2/subjects");
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(list.body.data.length);
    const found = list.body.data.find(
      (item) => item.id === created.body.data.id,
    );
    expect(found).toBeDefined();
    expect(found.ativa).toBe(false);

    const byId = await request(app).get(`/v2/subjects/${created.body.data.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.professor.id).toBe(professor.id);
  });

  it("aplica ativa=true por padrão quando omitido no POST", async () => {
    const professor = await createUserFixture();

    const response = await request(app)
      .post("/v2/subjects")
      .send({ nome: "Matéria padrão", professorId: professor.id });

    expect(response.status).toBe(201);
    subjectIds.push(response.body.data.id);
    expect(response.body.data.ativa).toBe(true);
  });

  it.each([
    { nome: "x".repeat(101) },
    { nome: null },
    { professorId: 0 },
    { professorId: true },
    { professorId: [1] },
    { ativa: "false" },
    { campoExtra: true },
  ])("rejeita campo isolado em POST: %j", async (invalid) => {
    const professor = await createUserFixture();

    const response = await request(app)
      .post("/v2/subjects")
      .send({ nome: "Matéria válida", professorId: professor.id, ...invalid });

    expectApiError(response, 400, "VALIDATION_ERROR");
  });

  it("rejeita PATCH vazio e campos extras", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);

    const empty = await request(app)
      .patch(`/v2/subjects/${subject.id}`)
      .send({});
    const extra = await request(app)
      .patch(`/v2/subjects/${subject.id}`)
      .send({ inesperado: true });

    expectApiError(empty, 400, "VALIDATION_ERROR");
    expectApiError(extra, 400, "VALIDATION_ERROR");
  });

  it("PATCH altera só os campos enviados e aceita ativa:false", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id, { ativa: true });

    const updated = await request(app)
      .patch(`/v2/subjects/${subject.id}`)
      .send({ nome: "Nome atualizado", ativa: false });

    expect(updated.status).toBe(200);
    expect(updated.body.data.nome).toBe("Nome atualizado");
    expect(updated.body.data.ativa).toBe(false);
    expect(updated.body.data.professor.id).toBe(professor.id);
  });

  it.each(["get", "patch", "delete"])(
    "valida parâmetros e ausência de matéria em %s",
    async (method) => {
      const client = request(app);
      const professor = await createUserFixture();
      const missingId = await (async () => {
        const subject = await createSubjectFixture(professor.id);
        await prisma.subject.delete({ where: { id: subject.id } });
        subjectIds.splice(subjectIds.indexOf(subject.id), 1);
        return subject.id;
      })();

      for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
        const invalid = await client[method](`/v2/subjects/${id}`).send(
          method === "patch" ? { nome: "Novo nome" } : undefined,
        );
        expectApiError(invalid, 400, "VALIDATION_ERROR");
      }

      const missing = await client[method](`/v2/subjects/${missingId}`).send(
        method === "patch" ? { nome: "Novo nome" } : undefined,
      );
      expectApiError(missing, 404, "NOT_FOUND");
    },
  );

  it("retorna 404 com mensagem do recurso quando o professor não existe", async () => {
    const response = await request(app)
      .post("/v2/subjects")
      .send({
        nome: "Matéria sem professor",
        professorId: await missingUserId(),
      });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("impede remover matéria com questão vinculada e permite sem vínculo", async () => {
    const professor = await createUserFixture();
    const withQuestion = await createSubjectFixture(professor.id);
    await createQuestionFixture(withQuestion.id, professor.id);

    const blocked = await request(app).delete(
      `/v2/subjects/${withQuestion.id}`,
    );
    expectApiError(blocked, 409, "CONFLICT");

    const empty = await createSubjectFixture(professor.id);
    const removed = await request(app).delete(`/v2/subjects/${empty.id}`);
    expect(removed.status).toBe(200);
    subjectIds.splice(subjectIds.indexOf(empty.id), 1);
  });
});

describe("Question V2 — CRUD e contrato", () => {
  it("cria, lista (ativas e inativas) e busca uma questão com subject/author aninhados", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);

    const created = await request(app).post("/v2/questions").send({
      enunciado: "O que é uma API REST?",
      dificuldade: 2,
      respostaCorreta: "Uma API baseada nas restrições de REST.",
      subjectId: subject.id,
      authorId: professor.id,
      ativa: false,
    });

    expect(created.status).toBe(201);
    expect(created.body.data.ativa).toBe(false);
    questionIds.push(created.body.data.id);

    const list = await request(app).get("/v2/questions");
    const found = list.body.data.find(
      (item) => item.id === created.body.data.id,
    );
    expect(found).toBeDefined();
    expect(found.ativa).toBe(false);

    const byId = await request(app).get(
      `/v2/questions/${created.body.data.id}`,
    );
    expect(byId.body.data.subject.id).toBe(subject.id);
    expect(byId.body.data.author.id).toBe(professor.id);
  });

  it.each([
    { enunciado: "ab" },
    { enunciado: "x".repeat(501) },
    { dificuldade: 0 },
    { dificuldade: 4 },
    { dificuldade: true },
    { dificuldade: [1] },
    { respostaCorreta: "" },
    { subjectId: 0 },
    { authorId: true },
    { campoExtra: true },
  ])("rejeita campo isolado em POST: %j", async (invalid) => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);

    const response = await request(app)
      .post("/v2/questions")
      .send({
        enunciado: "Enunciado válido",
        dificuldade: 2,
        subjectId: subject.id,
        authorId: professor.id,
        ...invalid,
      });

    expectApiError(response, 400, "VALIDATION_ERROR");
  });

  it("rejeita PATCH vazio e campos extras", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);
    const question = await createQuestionFixture(subject.id, professor.id);

    const empty = await request(app)
      .patch(`/v2/questions/${question.id}`)
      .send({});
    const extra = await request(app)
      .patch(`/v2/questions/${question.id}`)
      .send({ inesperado: true });

    expectApiError(empty, 400, "VALIDATION_ERROR");
    expectApiError(extra, 400, "VALIDATION_ERROR");
  });

  it("PATCH remove respostaCorreta com null sem apagar campos omitidos", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);
    const question = await createQuestionFixture(subject.id, professor.id, {
      respostaCorreta: "Resposta original",
    });

    const updated = await request(app)
      .patch(`/v2/questions/${question.id}`)
      .send({ respostaCorreta: null });

    expect(updated.status).toBe(200);
    expect(updated.body.data.respostaCorreta).toBeNull();
    expect(updated.body.data.enunciado).toBe(question.enunciado);
  });

  it("PATCH aceita ativa:false preservando os demais campos", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);
    const question = await createQuestionFixture(subject.id, professor.id, {
      ativa: true,
    });

    const updated = await request(app)
      .patch(`/v2/questions/${question.id}`)
      .send({ ativa: false });

    expect(updated.status).toBe(200);
    expect(updated.body.data.ativa).toBe(false);
    expect(updated.body.data.enunciado).toBe(question.enunciado);
  });

  it.each(["get", "patch", "delete"])(
    "valida parâmetros e ausência de questão em %s",
    async (method) => {
      const client = request(app);
      const professor = await createUserFixture();
      const subject = await createSubjectFixture(professor.id);
      const missingId = await (async () => {
        const question = await createQuestionFixture(subject.id, professor.id);
        await prisma.question.delete({ where: { id: question.id } });
        questionIds.splice(questionIds.indexOf(question.id), 1);
        return question.id;
      })();

      for (const id of ["abc", "0", "-1", "1.5", "2147483648"]) {
        const invalid = await client[method](`/v2/questions/${id}`).send(
          method === "patch" ? { ativa: false } : undefined,
        );
        expectApiError(invalid, 400, "VALIDATION_ERROR");
      }

      const missing = await client[method](`/v2/questions/${missingId}`).send(
        method === "patch" ? { ativa: false } : undefined,
      );
      expectApiError(missing, 404, "NOT_FOUND");
    },
  );

  it("retorna 404 com mensagem do recurso quando matéria ou autor não existem", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);

    const missingSubject = await request(app)
      .post("/v2/questions")
      .send({
        enunciado: "Enunciado válido",
        dificuldade: 2,
        subjectId: await missingSubjectId(professor.id),
        authorId: professor.id,
      });
    const missingAuthor = await request(app)
      .post("/v2/questions")
      .send({
        enunciado: "Enunciado válido",
        dificuldade: 2,
        subjectId: subject.id,
        authorId: await missingUserId(),
      });

    expectApiError(missingSubject, 404, "NOT_FOUND");
    expectApiError(missingAuthor, 404, "NOT_FOUND");
  });

  it("remove uma questão sem impedimento", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);
    const question = await createQuestionFixture(subject.id, professor.id);

    const removed = await request(app).delete(`/v2/questions/${question.id}`);
    expect(removed.status).toBe(200);
    questionIds.splice(questionIds.indexOf(question.id), 1);
  });
});

describe("Coexistência entre versões", () => {
  it("matéria criada na V2 é lida pela V1 com a mesma representação", async () => {
    const professor = await createUserFixture();

    const created = await request(app)
      .post("/v2/subjects")
      .send({ nome: "Matéria compartilhada", professorId: professor.id });
    subjectIds.push(created.body.data.id);

    const foundV1 = await request(app).get(
      `/v1/subjects/${created.body.data.id}`,
    );
    expect(foundV1.status).toBe(200);
    expect(foundV1.body.data.nome).toBe("Matéria compartilhada");
  });

  it("DELETE de matéria pela V2 reflete como 404 na V1", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);

    const removed = await request(app).delete(`/v2/subjects/${subject.id}`);
    expect(removed.status).toBe(200);
    subjectIds.splice(subjectIds.indexOf(subject.id), 1);

    const foundV1 = await request(app).get(`/v1/subjects/${subject.id}`);
    expectApiError(foundV1, 404, "NOT_FOUND");
  });

  it("DELETE de questão pela V1 reflete como 404 na V2", async () => {
    const professor = await createUserFixture();
    const subject = await createSubjectFixture(professor.id);
    const question = await createQuestionFixture(subject.id, professor.id);

    const removed = await request(app).delete(`/v1/questions/${question.id}`);
    expect(removed.status).toBe(200);
    questionIds.splice(questionIds.indexOf(question.id), 1);

    const foundV2 = await request(app).get(`/v2/questions/${question.id}`);
    expectApiError(foundV2, 404, "NOT_FOUND");
  });
});

describe("Rotas sem prefixo de versão", () => {
  it("retorna 404 para /subjects e /questions sem /v1 ou /v2", async () => {
    const withoutPrefixSubjects = await request(app).get("/subjects");
    const withoutPrefixQuestions = await request(app).get("/questions");

    expectApiError(withoutPrefixSubjects, 404, "NOT_FOUND");
    expectApiError(withoutPrefixQuestions, 404, "NOT_FOUND");
  });
});
