import prisma from "../../../config/database.js";
import { ConflictError, NotFoundError } from "../../../errors/AppError.js";

// MODIFICADO: busca também campos legados para adaptar a resposta sem editar a V1.
const userV2ReadSelect = {
  id: true,
  primeiroNome: true,
  sobrenome: true,
  email: true,
  tipoUsuario: true,
  telefone: true,
  foto: true,
  createdAt: true,
  updatedAt: true,
  nome: true,
  papel: true,
};

/**
 * Converte o papel público da V2 no enum persistido pela V1.
 * @param {"professor"|"admin"} tipoUsuario - Papel em minúsculas da V2.
 * @returns {"PROFESSOR"|"ADMIN"} Enum histórico equivalente.
 */
function toPapel(tipoUsuario) {
  return tipoUsuario === "admin" ? "ADMIN" : "PROFESSOR";
}

/**
 * Constrói o nome completo que mantém consumidores da V1 funcionando.
 * @param {string} primeiroNome - Primeiro nome já validado.
 * @param {string|null} sobrenome - Sobrenome validado ou nulo em um monônimo legado.
 * @returns {string} Nome completo equivalente ao contrato V1.
 */
function toNome(primeiroNome, sobrenome) {
  return [primeiroNome, sobrenome].filter(Boolean).join(" ");
}

/**
 * ADICIONADO: interpreta um nome legado sem gravar seus valores derivados.
 * @param {string} nome - Nome completo que continua pertencendo à V1.
 * @returns {{primeiroNome: string, sobrenome: string|null}} Partes para o fallback.
 */
function splitLegacyName(nome) {
  const [primeiroNome, ...restante] = nome.trim().split(/\s+/);
  return {
    primeiroNome,
    sobrenome: restante.length > 0 ? restante.join(" ") : null,
  };
}

/**
 * ADICIONADO: prepara somente os campos públicos da V2.
 * @param {object} user - Registro com campos V1 e V2 selecionados.
 * @returns {object} Resposta V2; não altera nem persiste o registro recebido.
 */
function toPublicUserV2(user) {
  const legacyName = splitLegacyName(user.nome);
  return {
    id: user.id,
    // Fallback somente para campos nulos; valores V2 existentes prevalecem.
    primeiroNome: user.primeiroNome ?? legacyName.primeiroNome,
    sobrenome: user.sobrenome ?? legacyName.sobrenome,
    email: user.email,
    tipoUsuario:
      user.tipoUsuario ?? (user.papel === "ADMIN" ? "admin" : "professor"),
    telefone: user.telefone,
    foto: user.foto,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    // nome e papel são internos e não entram no JSON V2.
  };
}

/** Lista usuários na representação pública da V2. */
export async function getAllUsers() {
  const users = await prisma.user.findMany({
    select: userV2ReadSelect,
    orderBy: { createdAt: "desc" },
  });
  // MODIFICADO: adapta registros legados em memória, sem UPDATE durante GET.
  return users.map(toPublicUserV2);
}

/** Busca um usuário na representação pública da V2. */
export async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userV2ReadSelect,
  });

  if (!user) {
    throw new NotFoundError(`Usuário com ID${userId} não encontrado`);
  }

  // MODIFICADO: aplica a mesma representação usada na listagem.
  return toPublicUserV2(user);
}

/** Cria um usuário e grava simultaneamente as representações V1 e V2. */
export async function createUser(data) {
  const owner = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (owner) throw new ConflictError("E-mail já cadastrado");

  const tipoUsuario = data.tipoUsuario ?? "professor";
  try {
    const created = await prisma.user.create({
      data: {
        ...data,
        tipoUsuario,
        // Mantém V2 → V1 na própria escrita, sem alterar arquivos da V1.
        nome: toNome(data.primeiroNome, data.sobrenome),
        papel: toPapel(tipoUsuario),
        foto: data.foto ?? null,
        telefone: data.telefone ?? null,
      },
      select: userV2ReadSelect,
    });
    return toPublicUserV2(created);
  } catch (error) {
    if (error?.code === "P2002")
      throw new ConflictError("E-mail já cadastrado");
    throw error;
  }
}

/** Atualiza a V2 e sincroniza os campos equivalentes da V1. */
export async function updateUser(userId, data) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // MODIFICADO: o PATCH também precisa interpretar um registro legado.
    select: userV2ReadSelect,
  });
  if (!user) throw new NotFoundError(`Usuário com ID${userId} não encontrado`);

  if (data.email !== undefined && data.email !== user.email) {
    const owner = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (owner) throw new ConflictError("E-mail já cadastrado");
  }

  const synchronizedData = { ...data };
  if (data.tipoUsuario !== undefined)
    synchronizedData.papel = toPapel(data.tipoUsuario);
  if (data.primeiroNome !== undefined || data.sobrenome !== undefined) {
    // MODIFICADO: reutiliza o fallback, preservando a parte omitida no PATCH.
    const current = toPublicUserV2(user);
    const primeiroNome = data.primeiroNome ?? current.primeiroNome;
    const sobrenome = data.sobrenome ?? current.sobrenome;
    // Grava as duas partes e nome juntos só quando a V2 modifica o nome.
    synchronizedData.primeiroNome = primeiroNome;
    synchronizedData.sobrenome = sobrenome || null;
    synchronizedData.nome = toNome(primeiroNome, sobrenome);
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: synchronizedData,
      select: userV2ReadSelect,
    });
    // MODIFICADO: PATCH só de e-mail/telefone também devolve legado adaptado.
    return toPublicUserV2(updated);
  } catch (error) {
    if (error?.code === "P2002")
      throw new ConflictError("E-mail já cadastrado");
    if (error?.code === "P2025")
      throw new NotFoundError(`Usuário com ID${userId} não encontrado`);
    throw error;
  }
}

/** Remove um usuário somente quando ele não possui vínculos. */
export async function deleteUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      _count: { select: { subjects: true, questions: true } },
    },
  });
  if (!user) throw new NotFoundError(`Usuário com ID${userId} não encontrado`);
  if (user._count.subjects > 0 || user._count.questions > 0) {
    throw new ConflictError("Usuário possui matérias ou questões vinculadas");
  }
  try {
    const deleted = await prisma.user.delete({
      where: { id: userId },
      select: userV2ReadSelect,
    });
    // MODIFICADO: DELETE devolve a mesma forma pública, inclusive para legado.
    return toPublicUserV2(deleted);
  } catch (error) {
    if (error?.code === "P2003" || error?.code === "P2014") {
      throw new ConflictError("Usuário possui matérias ou questões vinculadas");
    }
    if (error?.code === "P2025") {
      throw new NotFoundError(`Usuário com ID${userId} não encontrado`);
    }
    throw error;
  }
}