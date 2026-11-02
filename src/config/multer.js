import multer from "multer";
import { AppError, ValidationError } from "../errors/AppError.js";

const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 9 },
  /** Filtra metadados; não certifica que os bytes constituem uma imagem segura. */
  fileFilter(_req, file, callback) {
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new ValidationError("Tipo de arquivo não permitido", [
          { field: "foto", message: "Envie JPEG, PNG, GIF ou WebP" },
        ]),
      );
    }
    callback(null, true);
  },
}).single("foto");

/**
 * Processa somente um arquivo foto e traduz erros do parser para o contrato HTTP.
 * JSON segue para o próximo middleware, porque Multer só processa multipart.
 * @param {import("express").Request} req - Campos e arquivo da requisição.
 * @param {import("express").Response} res - Resposta Express.
 * @param {import("express").NextFunction} next - Próximo middleware.
 */
export default function uploadPhoto(req, res, next) {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(
          new AppError(
            "Foto excede o limite de 5 MiB",
            413,
            "PAYLOAD_TOO_LARGE",
          ),
        );
      }
      return next(
        new AppError(
          "Multipart inválido: confira campo foto e limites",
          400,
          "INVALID_UPLOAD",
        ),
      );
    }
    // ADICIONADO: erros conhecidos do envelope multipart são entrada inválida.
    if (
      error?.message === "Unexpected end of form" ||
      error?.message === "Multipart: Boundary not found"
    ) {
      return next(
        new ValidationError("Multipart inválido: confira corpo e boundary"),
      );
    }
    next(error);
  });
}