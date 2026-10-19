// ADICIONADO: agregador V2; matérias e questões incluídas na atividade.
import express from "express";
import userRoutes from "./userRoutes.js";
import subjectRoutes from "./subjectRoutes.js";
import questionRoutes from "./questionRoutes.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", version: "v2" });
});
router.use("/users", userRoutes);
router.use("/subjects", subjectRoutes);
router.use("/questions", questionRoutes);

export default router;
