import * as userService from "../services/userService.js";

/**
 * Cria um usuário a partir de dados já validados pelo middleware.
 * @param {import("express").Request} req - Requisição HTTP.
 * @param {import("express").Response} res - Resposta HTTP.
 * @param {import("express").NextFunction} next - Encaminhador de erros.
 * @returns {Promise<void>} Resposta de criação ou encaminhamento de erro.
 */
export async function create(req, res, next) {
  try {
    const data = await userService.createUser(req.body);
    res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso",
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lista todos os usuários públicos.
 * @param {import("express").Request} _req - Requisição HTTP não utilizada.
 * @param {import("express").Response} res - Resposta HTTP.
 * @param {import("express").NextFunction} next - Encaminhador de erros.
 * @returns {Promise<void>} Resposta de listagem ou encaminhamento de erro.
 */
export async function getAll(_req, res, next) {
  try {
    const data = await userService.getAllUsers();
    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
}

/**
 * Busca um usuário pelo ID já convertido pelo schema.
 * @param {import("express").Request} req - Requisição HTTP.
 * @param {import("express").Response} res - Resposta HTTP.
 * @param {import("express").NextFunction} next - Encaminhador de erros.
 * @returns {Promise<void>} Resposta de busca ou encaminhamento de erro.
 */
export async function getById(req, res, next) {
  try {
    const data = await userService.getUserById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * Atualiza parcialmente um usuário com dados validados.
 * @param {import("express").Request} req - Requisição HTTP.
 * @param {import("express").Response} res - Resposta HTTP.
 * @param {import("express").NextFunction} next - Encaminhador de erros.
 * @returns {Promise<void>} Resposta de atualização ou encaminhamento de erro.
 */
export async function update(req, res, next) {
  try {
    const data = await userService.updateUser(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Usuário atualizado com sucesso",
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove um usuário sem relações vinculadas.
 * @param {import("express").Request} req - Requisição HTTP.
 * @param {import("express").Response} res - Resposta HTTP.
 * @param {import("express").NextFunction} next - Encaminhador de erros.
 * @returns {Promise<void>} Resposta de remoção ou encaminhamento de erro.
 */
export async function remove(req, res, next) {
  try {
    const data = await userService.deleteUser(req.params.id);
    res.status(200).json({
      success: true,
      message: "Usuário removido com sucesso",
      data,
    });
  } catch (error) {
    next(error);
  }
}
