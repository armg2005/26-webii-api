import prisma from "../../../config/database.js";
import { ConflictError, NotFoundError } from "../../../errors/AppError.js";

const publicUserSelect = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  foto: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Busca todos os usuários no formato público, do mais recente para o mais antigo.
 * @returns {Promise<object[]>} Lista de usuários sem campos internos.
 */
export function getAllUsers() {
  return prisma.user.findMany({
    select: publicUserSelect,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Busca um usuário por identificador.
 * @param {number} userId - ID já validado pelo middleware.
 * @returns {Promise<object>} Usuário público encontrado.
 * @throws {NotFoundError} Quando o usuário não existe.
 */
export async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new NotFoundError(`Usuário com ID ${userId} não encontrado`);
  }

  return user;
}

/**
 * Cria um usuário depois de verificar a unicidade do e-mail.
 * @param {{nome: string, email: string, papel?: "PROFESSOR"|"ADMIN", foto?: string|null}} data - Dados já parseados pelo Zod.
 * @returns {Promise<object>} Usuário público criado.
 * @throws {ConflictError} Quando o e-mail já pertence a outro usuário.
 */
export async function createUser(data) {
  const owner = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (owner) {
    throw new ConflictError("E-mail já cadastrado");
  }

  try {
    return await prisma.user.create({
      data: {
        nome: data.nome,
        email: data.email,
        papel: data.papel ?? "PROFESSOR",
        foto: data.foto ?? null,
      },
      select: publicUserSelect,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new ConflictError("E-mail já cadastrado");
    }

    throw error;
  }
}

/**
 * Atualiza somente os campos enviados para um usuário existente.
 * @param {number} userId - ID já validado pelo middleware.
 * @param {{nome?: string, email?: string, papel?: "PROFESSOR"|"ADMIN", foto?: string|null}} data - Campos permitidos.
 * @returns {Promise<object>} Usuário público atualizado.
 * @throws {NotFoundError} Quando o usuário não existe.
 * @throws {ConflictError} Quando outro usuário já possui o e-mail.
 */
export async function updateUser(userId, data) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new NotFoundError(`Usuário com ID ${userId} não encontrado`);
  }

  if (data.email !== undefined && data.email !== user.email) {
    const owner = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (owner) {
      throw new ConflictError("E-mail já cadastrado");
    }
  }

  try {
    return await prisma.user.update({
      where: { id: userId },
      data,
      select: publicUserSelect,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new ConflictError("E-mail já cadastrado");
    }

    throw error;
  }
}

/**
 * Remove um usuário que não possua matérias nem questões vinculadas.
 * @param {number} userId - ID já validado pelo middleware.
 * @returns {Promise<object>} Usuário público removido.
 * @throws {NotFoundError} Quando o usuário não existe.
 * @throws {ConflictError} Quando há matérias ou questões vinculadas.
 */
export async function deleteUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      _count: { select: { subjects: true, questions: true } },
    },
  });

  if (!user) {
    throw new NotFoundError(`Usuário com ID ${userId} não encontrado`);
  }

  if (user._count.subjects > 0 || user._count.questions > 0) {
    throw new ConflictError("Usuário possui matérias ou questões vinculadas");
  }

  try {
    return await prisma.user.delete({
      where: { id: userId },
      select: publicUserSelect,
    });
  } catch (error) {
    if (error?.code === "P2003" || error?.code === "P2014") {
      throw new ConflictError("Usuário possui matérias ou questões vinculadas");
    }

    if (error?.code === "P2025") {
      throw new NotFoundError(`Usuário com ID ${userId} não encontrado`);
    }

    throw error;
  }
}
