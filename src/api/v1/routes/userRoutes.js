import express from "express";
import * as userController from "../controllers/userController.js";
import validate from "../../../middlewares/validate.js";
import {
  createUserSchema,
  idParamSchema,
  updateUserSchema,
} from "../schemas/userSchema.js";

const router = express.Router();

router.post("/", validate(createUserSchema), userController.create);
router.get("/", userController.getAll);
router.get("/:id", validate(idParamSchema, "params"), userController.getById);
router.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateUserSchema),
  userController.update,
);
router.delete("/:id", validate(idParamSchema, "params"), userController.remove);

export default router;
