import { ValidationError } from "../../../errors/AppError.js";

export default function requireUpdateData(req, _res, next) {
  const hasBodyFields = Object.keys(req.body ?? {}).length > 0;
  const hasFile = Boolean(req.file);

  if (!hasBodyFields && !hasFile) {
    return next(
      new ValidationError(
        "Envie pelo menos um campo ou uma foto para atualização",
      ),
    );
  }

  return next();
}