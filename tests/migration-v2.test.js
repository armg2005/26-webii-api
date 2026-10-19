// MODIFICADO: verifica expansão gerada pelo Prisma, sem preenchimento de legado.
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import pg from "pg";

describe("Prática — migration aditiva V2", () => {
  it("preserva dados V1 e deixa as colunas novas nulas no legado", async () => {
    const client = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await client.connect();
    const schema = `aula08_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("BEGIN");
      // O schema é novo e exclusivo desta transação. ROLLBACK remove só esta prova.
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      for (const file of [
        "prisma/migrations/20260819003925_create_users/migration.sql",
        "prisma/migrations/20260824135920_add_subjects_and_questions/migration.sql",
      ])
        await client.query(
          await readFile(new URL(`../${file}`, import.meta.url), "utf8"),
        );
      await client.query(
        'INSERT INTO "users" ("nome", "email", "papel", "data_atualizacao") VALUES ($1, $2, $3, NOW()), ($4, $5, $6, NOW())',
        [
          "Madonna",
          "mono@example.com",
          "ADMIN",
          "  Ana   Maria Silva  ",
          "composto@example.com",
          "PROFESSOR",
        ],
      );
      const before = (
        await client.query(
          'SELECT id, nome, email, papel FROM "users" ORDER BY id',
        )
      ).rows;
      await client.query(
        'INSERT INTO "subjects" ("nome", "professor_id", "data_atualizacao") VALUES ($1, $2, NOW())',
        ["Preservada", before[0].id],
      );
      // Localiza a migração pelo nome, sem depender do timestamp gerado.
      const migrationNames = await readdir(
        new URL("../prisma/migrations/", import.meta.url),
      );
      const v2Migrations = migrationNames.filter((name) =>
        /^\d{14}_add_v2_user_fields$/.test(name),
      );
      expect(v2Migrations).toHaveLength(1);
      const sql = await readFile(
        new URL(
          `../prisma/migrations/${v2Migrations[0]}/migration.sql`,
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(sql);
      expect(
        (
          await client.query(
            'SELECT id, nome, email, papel FROM "users" ORDER BY id',
          )
        ).rows,
      ).toEqual(before);
      const after = (
        await client.query(
          'SELECT primeiro_nome, sobrenome, tipo_usuario, telefone FROM "users" ORDER BY id',
        )
      ).rows;
      // MODIFICADO: somente a estrutura é migrada; a representação cabe ao service.
      expect(after).toEqual([
        {
          primeiro_nome: null,
          sobrenome: null,
          tipo_usuario: null,
          telefone: null,
        },
        {
          primeiro_nome: null,
          sobrenome: null,
          tipo_usuario: null,
          telefone: null,
        },
      ]);
      expect(
        (await client.query('SELECT professor_id FROM "subjects"')).rows[0]
          .professor_id,
      ).toBe(before[0].id);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
