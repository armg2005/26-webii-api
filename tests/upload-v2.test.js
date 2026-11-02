import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { createUploadFixtures } from "./fixtures/createUploadFixtures.js";
import { startUploadcareStub } from "./helpers/uploadcareStub.js";
import { postCases, patchCases } from "./uploadCases.js";

let apiServer;
let stub;
let files;
const ownedIds = [];

beforeAll(async () => {
  await new Promise((resolve) => {
    apiServer = app.listen(0, "127.0.0.1", resolve);
  });
  files = await createUploadFixtures();
  stub = await startUploadcareStub();
  vi.stubEnv("UPLOADCARE_TEST_BASE_URL", stub.url);
  vi.stubEnv("UPLOADCARE_PUBLIC_KEY", "demopublickey");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ownedIds.splice(0) } } });
  vi.stubEnv("UPLOADCARE_PUBLIC_KEY", "demopublickey");
});
afterAll(async () => {
  await new Promise((resolve) => apiServer.close(resolve));
  await stub.close();
  vi.unstubAllEnvs();
});

/** Prepara usuário por JSON, sem depender de upload ou do PATCH da atividade. */
async function fixture() {
  const response = await request(apiServer)
    .post("/v2/users")
    .send({
      primeiroNome: "Ada",
      sobrenome: "Lovelace",
      email: `${randomUUID()}@example.com`,
      foto: "https://example.com/previous.png",
    });
  expect(response.status).toBe(201);
  ownedIds.push(response.body.data.id);
  return response.body.data;
}

/** Monta campos/arquivos reais do formulário, inclusive multipart vazio. */
async function buildRequest(method, url, fields, scenario) {
  if (scenario.raw !== undefined) {
    const rawRequest = request(apiServer)[method](url);
    return rawRequest
      .set("Content-Type", scenario.contentType)
      .send(scenario.raw);
  }
  if (scenario.json) return request(apiServer)[method](url).send(fields);
  // Lê as fixtures antes do envio; fetch preserva a resposta HTTP antecipada
  // quando a rota pendente ainda não consome o corpo multipart.
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  if (scenario.file) {
    const filePath = files[scenario.file];
    form.append(
      scenario.fileField || "foto",
      new Blob([await readFile(filePath)], {
        type: scenario.mime || "image/png",
      }),
      path.basename(filePath),
    );
    if (scenario.second)
      form.append(
        "foto",
        new Blob([await readFile(files.image)], {
          type: "image/png",
        }),
        "image.png",
      );
  }
  const response = await fetch(
    `http://127.0.0.1:${apiServer.address().port}${url}`,
    {
      method: method.toUpperCase(),
      body: form,
    },
  );
  return { status: response.status, body: await response.json() };
}

/** Confere resposta, número de uploads e persistência observável por V1/GET/lista. */
async function check(response, scenario, countBefore, existing, email) {
  if (response.status === 201) ownedIds.push(response.body.data.id);
  expect(response.status).toBe(scenario.status);
  expect(stub.uploads.length - countBefore).toBe(scenario.calls);
  if (scenario.code) {
    expect(response.body.error.code).toBe(scenario.code);
    expect(response.body.success).toBe(false);
    if (scenario.message)
      expect(response.body.error.message).toBe(scenario.message);
    if (scenario.field)
      expect(
        response.body.error.details.some(
          (item) => item.field === scenario.field,
        ),
      ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(
      "sensitive-provider-detail",
    );
    if (existing && !scenario.missing) {
      const unchanged = await prisma.user.findUnique({
        where: { id: existing.id },
      });
      expect(unchanged.foto).toBe(existing.foto);
      expect(unchanged.primeiroNome).toBe(existing.primeiroNome);
    }
    if (!existing && !scenario.duplicate)
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    return;
  }
  const data = response.body.data;
  const expectedPhoto = {
    previous: "https://example.com/previous.png",
    manual: "https://example.com/manual.png",
    null: null,
  }[scenario.photo];
  if (scenario.photo === "uploaded") {
    expect(data.foto).toMatch(/^https:\/\/[^/]+\/[0-9a-f-]{36}\/$/);
    const sent = stub.uploads.at(-1).toString("latin1");
    expect(sent).toMatch(/name="UPLOADCARE_STORE"\r\n\r\n1/);
    expect(sent).toMatch(/filename="[0-9a-f-]{36}\.png"/);
  } else expect(data.foto).toBe(expectedPhoto);
  expect(data.primeiroNome).toBe(scenario.fields?.primeiroNome || "Ada");
  expect(data.sobrenome).toBe("Lovelace");
  expect(data.tipoUsuario).toBe(scenario.fields?.tipoUsuario || "professor");
  if (scenario.fields?.telefone)
    expect(data.telefone).toBe(scenario.fields.telefone);
  const stored = await prisma.user.findUnique({ where: { id: data.id } });
  expect(stored.foto).toBe(data.foto);
  const found = await request(apiServer).get(`/v2/users/${data.id}`);
  const v1 = await request(apiServer).get(`/v1/users/${data.id}`);
  const list = await request(apiServer).get("/v2/users");
  expect(found.body.data.foto).toBe(data.foto);
  expect(v1.body.data.foto).toBe(data.foto);
  expect(v1.body.data.nome).toBe(`${data.primeiroNome} ${data.sobrenome}`);
  expect(list.body.data.find((item) => item.id === data.id).foto).toBe(
    data.foto,
  );
}

describe("Prática — upload POST V2", () => {
  it.each(postCases)("$title", async (scenario) => {
    const owner = scenario.duplicate ? await fixture() : null;
    const email = owner?.email || `${randomUUID()}@example.com`;
    const fields = {
      primeiroNome: "Ada",
      sobrenome: "Lovelace",
      email,
      ...scenario.fields,
    };
    if (scenario.key !== undefined)
      vi.stubEnv("UPLOADCARE_PUBLIC_KEY", scenario.key);
    const before = stub.uploads.length;
    const response = await buildRequest("post", "/v2/users", fields, scenario);
    await check(response, scenario, before, null, email);
  });
});

describe("Atividade — upload PATCH V2", () => {
  it.each(patchCases)("$title", async (scenario) => {
    const user = await fixture();
    const fields = { ...scenario.fields };
    if (scenario.duplicate) fields.email = (await fixture()).email;
    if (scenario.missing) await prisma.user.delete({ where: { id: user.id } });
    const id = scenario.invalidId ? "abc" : user.id;
    const before = stub.uploads.length;
    const response = await buildRequest(
      "patch",
      `/v2/users/${id}`,
      fields,
      scenario,
    );
    await check(response, scenario, before, user);
  });
});