// ADICIONADO: rotas relativas V2 com schemas próprios e middleware compartilhado.
import express from "express";
import * as userController from "../controllers/userController.js";
import validate from "../../../middlewares/validate.js";
import {
  createUserV2Schema,
  idParamSchema,
  updateUserV2Schema,
} from "../schemas/userSchema.js";

const router = express.Router();

router.post("/", validate(createUserV2Schema), userController.create);
router.get("/", userController.getAll);
router.get("/:id", validate(idParamSchema, "params"), userController.getById);
router.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateUserV2Schema),
  userController.update,
);
router.delete("/:id", validate(idParamSchema, "params"), userController.remove);

export default router;
