import express from "express";

import * as subjectController from "../controllers/subjectController.js";

import validate from "../../../middlewares/validate.js";

import {
  createSubjectSchema,
  updateSubjectSchema,
  idParamSchema,
} from "../schemas/subjectSchema.js";

const router = express.Router();

// Criar matéria
router.post(
  "/",
  validate(createSubjectSchema, "body"),
  subjectController.create,
);

// Listar matérias
router.get("/", subjectController.getAll);

// Buscar matéria por ID
router.get(
  "/:id",
  validate(idParamSchema, "params"),
  subjectController.getById,
);

// Atualizar matéria
router.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateSubjectSchema, "body"),
  subjectController.update,
);

// Remover matéria
router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  subjectController.remove,
);

export default router;
