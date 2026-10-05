import { z } from "zod";
import { positiveIdSchema } from "../../../schemas/idSchema.js";

const papelSchema = z.enum(["PROFESSOR", "ADMIN"], {
  message: "Papel deve ser PROFESSOR ou ADMIN",
});

const fotoSchema = z.union([
  z.string().trim().url("URL da foto inválida"),
  z.null(),
]);

/** Schema para POST /users. */
export const createUserSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, "Nome deve ter pelo menos 3 caracteres")
      .max(100, "Nome deve ter no máximo 100 caracteres"),
    email: z.string().trim().toLowerCase().email("Email inválido"),
    papel: papelSchema.optional(),
    foto: fotoSchema.optional(),
  })
  .strict();

/** Schema para PATCH /users/:id. */
export const updateUserSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, "Nome deve ter pelo menos 3 caracteres")
      .max(100, "Nome deve ter no máximo 100 caracteres")
      .optional(),
    email: z.string().trim().toLowerCase().email("Email inválido").optional(),
    papel: papelSchema.optional(),
    foto: fotoSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualização",
  });

/** Schema para parâmetros :id positivos. */
export const idParamSchema = z.object({
  id: positiveIdSchema,
});
