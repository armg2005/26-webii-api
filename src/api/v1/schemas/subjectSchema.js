import { z } from "zod";
import { positiveIdSchema } from "../../../schemas/idSchema.js";

/** Schema para POST /subjects. */
export const createSubjectSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, "Nome deve ter pelo menos 3 caracteres")
      .max(100, "Nome deve ter no máximo 100 caracteres"),
    professorId: positiveIdSchema,
    ativa: z.boolean().optional(),
  })
  .strict();

/** Schema para PATCH /subjects/:id. */
export const updateSubjectSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, "Nome deve ter pelo menos 3 caracteres")
      .max(100, "Nome deve ter no máximo 100 caracteres")
      .optional(),
    professorId: positiveIdSchema.optional(),
    ativa: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualização",
  });

/** Schema para parâmetros :id de matérias. */
export const idParamSchema = z.object({
  id: positiveIdSchema,
});
