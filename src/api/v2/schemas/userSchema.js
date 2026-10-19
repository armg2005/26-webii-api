// ADICIONADO: valida somente o contrato V2, sem editar o schema HTTP da V1.
import { z } from "zod";
import { positiveIdSchema } from "../../../schemas/idSchema.js";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, "Telefone deve conter 10 ou 11 dígitos");

const tipoUsuarioSchema = z.enum(["professor", "admin"], {
  message: "Tipo de usuário deve ser professor ou admin",
});

const optionalV2Fields = {
  primeiroNome: z
    .string()
    .trim()
    .min(2, "Primeiro nome deve ter pelo menos 2 caracteres")
    .max(50, "Primeiro nome deve ter no máximo 50 caracteres")
    .optional(),
  sobrenome: z
    .string()
    .trim()
    .min(2, "Sobrenome deve ter pelo menos 2 caracteres")
    .max(100, "Sobrenome deve ter no máximo 100 caracteres")
    .optional(),
  email: z.string().trim().toLowerCase().email("Email inválido").optional(),
  tipoUsuario: tipoUsuarioSchema.optional(),
  telefone: z.union([phoneSchema, z.null()]).optional(),
  foto: z
    .union([z.string().trim().url("URL da foto inválida"), z.null()])
    .optional(),
};

/** Schema para POST /v2/users. */
export const createUserV2Schema = z
  .object({
    primeiroNome: optionalV2Fields.primeiroNome.unwrap(),
    sobrenome: optionalV2Fields.sobrenome.unwrap(),
    email: optionalV2Fields.email.unwrap(),
    tipoUsuario: optionalV2Fields.tipoUsuario.optional(),
    telefone: optionalV2Fields.telefone,
    foto: optionalV2Fields.foto,
  })
  .strict();

/** Schema para PATCH /v2/users/:id. */
export const updateUserV2Schema = z
  .object(optionalV2Fields)
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualização",
  });

/** Schema para parâmetros :id positivos. */
export const idParamSchema = z.object({ id: positiveIdSchema });
