// ADICIONADO: agregador V2; matérias e questões só serão incluídas na atividade.
import express from "express";
import userRoutes from "./userRoutes.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", version: "v2" });
});
router.use("/users", userRoutes);

export default router;