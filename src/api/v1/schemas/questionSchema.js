import { z } from "zod";
import { positiveIdSchema } from "../../../schemas/idSchema.js";

/** Schema para resposta correta opcional. */
const respostaCorretaSchema = z.union([
  z
    .string()
    .trim()
    .min(1, "Resposta correta não pode ser vazia")
    .max(500, "Resposta correta deve ter no máximo 500 caracteres"),
  z.null(),
]);

/** Schema para POST /questions. */
export const createQuestionSchema = z
  .object({
    enunciado: z
      .string()
      .trim()
      .min(3, "Enunciado deve ter pelo menos 3 caracteres")
      .max(500, "Enunciado deve ter no máximo 500 caracteres"),
    dificuldade: z
      .union([
        z.number(),
        z.string().regex(/^\d+$/, "Dificuldade deve ser um número inteiro"),
      ])
      .pipe(
        z.coerce
          .number()
          .int("Dificuldade deve ser um número inteiro")
          .min(1, "Dificuldade deve estar entre 1 e 3")
          .max(3, "Dificuldade deve estar entre 1 e 3"),
      ),
    respostaCorreta: respostaCorretaSchema.optional(),
    subjectId: positiveIdSchema,
    authorId: positiveIdSchema,
    ativa: z.boolean().optional(),
  })
  .strict();

/** Schema para PATCH /questions/:id. */
export const updateQuestionSchema = z
  .object({
    enunciado: z
      .string()
      .trim()
      .min(3, "Enunciado deve ter pelo menos 3 caracteres")
      .max(500, "Enunciado deve ter no máximo 500 caracteres")
      .optional(),
    dificuldade: z
      .union([
        z.number(),
        z.string().regex(/^\d+$/, "Dificuldade deve ser um número inteiro"),
      ])
      .pipe(
        z.coerce
          .number()
          .int("Dificuldade deve ser um número inteiro")
          .min(1, "Dificuldade deve estar entre 1 e 3")
          .max(3, "Dificuldade deve estar entre 1 e 3"),
      )
      .optional(),
    respostaCorreta: respostaCorretaSchema.optional(),
    subjectId: positiveIdSchema.optional(),
    authorId: positiveIdSchema.optional(),
    ativa: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualização",
  });

/** Schema para parâmetros :id de questões. */
export const idParamSchema = z.object({
  id: positiveIdSchema,
});
