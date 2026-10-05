import express from "express";

import * as questionController from "../controllers/questionController.js";

import validate from "../../../middlewares/validate.js";

import {
  createQuestionSchema,
  updateQuestionSchema,
  idParamSchema as questionIdParamSchema,
} from "../schemas/questionSchema.js";

const router = express.Router();

// Criar questão
router.post(
  "/",
  validate(createQuestionSchema, "body"),
  questionController.create,
);

// Listar questões
router.get("/", questionController.getAll);

// Buscar questão por ID
router.get(
  "/:id",
  validate(questionIdParamSchema, "params"),
  questionController.getById,
);

// Atualizar questão
router.patch(
  "/:id",
  validate(questionIdParamSchema, "params"),
  validate(updateQuestionSchema, "body"),
  questionController.update,
);

// Remover questão
router.delete(
  "/:id",
  validate(questionIdParamSchema, "params"),
  questionController.remove,
);

export default router;
