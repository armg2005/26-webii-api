import prisma from "../../../config/database.js";
import { ConflictError, NotFoundError } from "../../../errors/AppError.js";

const publicUserSelect = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  foto: true,
};

const publicSubjectSelect = {
  id: true,
  nome: true,
  ativa: true,
  createdAt: true,
  updatedAt: true,
  professor: { select: publicUserSelect },
};

/**
 * Lista todas as matérias.
 * @returns {Promise<Array>} Lista de matérias.
 */
export const getAllSubjects = async () => {
  return prisma.subject.findMany({
    select: publicSubjectSelect,
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Busca uma matéria pelo ID.
 * @param {number} subjectId ID da matéria.
 * @returns {Promise<Object>} Matéria encontrada.
 * @throws {NotFoundError} Quando a matéria não existe.
 */
export const getSubjectById = async (subjectId) => {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: publicSubjectSelect,
  });

  if (!subject) {
    throw new NotFoundError(`Matéria com ID ${subjectId} não encontrada`);
  }

  return subject;
};

/**
 * Cria uma matéria após validar a existência do professor.
 * @param {Object} subjectData Dados da matéria.
 * @returns {Promise<Object>} Matéria criada.
 * @throws {NotFoundError} Quando o professor não existe.
 */
export const createSubject = async (subjectData) => {
  const professor = await prisma.user.findUnique({
    where: { id: subjectData.professorId },
    select: { id: true },
  });

  if (!professor) {
    throw new NotFoundError(
      `Professor com ID ${subjectData.professorId} não encontrado`,
    );
  }

  return prisma.subject.create({
    data: {
      nome: subjectData.nome,
      professorId: subjectData.professorId,
      ativa: subjectData.ativa ?? true,
    },
    select: publicSubjectSelect,
  });
};

/**
 * Atualiza uma matéria existente.
 * @param {number} subjectId ID da matéria.
 * @param {Object} subjectData Dados para atualização.
 * @returns {Promise<Object>} Matéria atualizada.
 * @throws {NotFoundError} Quando a matéria ou o professor não existe.
 */
export const updateSubject = async (subjectId, subjectData) => {
  const subjectExists = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });

  if (!subjectExists) {
    throw new NotFoundError(`Matéria com ID ${subjectId} não encontrada`);
  }

  if (Object.hasOwn(subjectData, "professorId")) {
    const professor = await prisma.user.findUnique({
      where: { id: subjectData.professorId },
      select: { id: true },
    });

    if (!professor) {
      throw new NotFoundError(
        `Professor com ID ${subjectData.professorId} não encontrado`,
      );
    }
  }

  const data = {};

  // Preserva somente os campos enviados no PATCH.
  if (Object.hasOwn(subjectData, "nome")) {
    data.nome = subjectData.nome;
  }

  if (Object.hasOwn(subjectData, "ativa")) {
    data.ativa = subjectData.ativa;
  }

  if (Object.hasOwn(subjectData, "professorId")) {
    data.professorId = subjectData.professorId;
  }

  return prisma.subject.update({
    where: { id: subjectId },
    data,
    select: publicSubjectSelect,
  });
};

/**
 * Exclui uma matéria sem questões vinculadas.
 * @param {number} subjectId ID da matéria.
 * @returns {Promise<Object>} Matéria excluída.
 * @throws {NotFoundError} Quando a matéria não existe.
 * @throws {ConflictError} Quando há questões vinculadas.
 */
export const deleteSubject = async (subjectId) => {
  const subjectExists = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: {
      id: true,
      _count: { select: { questions: true } },
    },
  });

  if (!subjectExists) {
    throw new NotFoundError(`Matéria com ID ${subjectId} não encontrada`);
  }

  if (subjectExists._count.questions > 0) {
    throw new ConflictError("Matéria possui questões vinculadas");
  }

  try {
    return await prisma.subject.delete({
      where: { id: subjectId },
      select: publicSubjectSelect,
    });
  } catch (error) {
    // Protege contra exclusões concorrentes e restrições do banco.
    if (error.code === "P2003" || error.code === "P2014") {
      throw new ConflictError("Matéria possui questões vinculadas");
    }

    if (error.code === "P2025") {
      throw new NotFoundError(`Matéria com ID ${subjectId} não encontrada`);
    }

    throw error;
  }
};
