import {
  AppError,
  NotFoundError,
  ValidationError,
} from "../errors/AppError.js";

/**
 * Encaminha rotas não encontradas para o contrato de erro padronizado da API.
 * @param {import("express").Request} req - Requisição recebida.
 * @param {import("express").Response} _res - Resposta Express não utilizada.
 * @param {import("express").NextFunction} next - Próximo middleware.
 * @returns {void}
 */
export function notFoundHandler(req, _res, next) {
  const error = new NotFoundError(
    `Rota ${req.method} ${req.originalUrl} não encontrada`,
  );
  error.hint = "Versões disponíveis: /v1"; // <- Novo
  next(error);
}


/**
 * Formata erros operacionais e protege detalhes internos em falhas inesperadas.
 * @param {Error} error - Erro recebido no pipeline do Express.
 * @param {import("express").Request} req - Requisição que causou o erro.
 * @param {import("express").Response} res - Resposta Express.
 * @param {import("express").NextFunction} next - Handler padrão do Express.
 * @returns {void}
 */
export default function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  // Erros conhecidos do express.json() acontecem antes da validação Zod.
  // Não confie em qualquer error.status: traduza somente tipos reconhecidos.
  if (error?.type === "entity.parse.failed" && error.status === 400) {
    error = new ValidationError("JSON malformado", [
      { field: "body", message: "Envie um documento JSON válido" },
    ]);
  } else if (error?.type === "entity.too.large" && error.status === 413) {
    error = new AppError(
      "Corpo da requisição excede o limite de 100 KB",
      413,
      "PAYLOAD_TOO_LARGE",
    );
  }

  if (error instanceof AppError && error.isOperational) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details.length > 0 && { details: error.details }),
        ...(error.hint && { hint: error.hint }),
      },
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  }

  if (error?.code === "P2002") {
    return res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "Registro duplicado" },
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  }

  console.error("Erro inesperado", {
    method: req.method,
    path: req.path,
    error,
  });

  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
    timestamp: new Date().toISOString(),
    path: req.path,
  });
}
