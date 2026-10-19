// ADICIONADO: controller V2; adaptação de legado permanece no service V2.
import * as userService from "../services/userService.js";

/** Cria um usuário usando o contrato V2. */
export async function create(req, res, next) {
  try {
    const data = await userService.createUser(req.body);
    res
      .status(201)
      .json({ success: true, message: "Usuário criado com sucesso", data });
  } catch (error) {
    next(error);
  }
}

/** Lista usuários na representação V2. */
export async function getAll(_req, res, next) {
  try {
    const data = await userService.getAllUsers();
    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
}

/** Busca um usuário por ID no contrato V2. */
export async function getById(req, res, next) {
  try {
    const data = await userService.getUserById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/** Atualiza parcialmente um usuário no contrato V2. */
export async function update(req, res, next) {
  try {
    const data = await userService.updateUser(req.params.id, req.body);
    res
      .status(200)
      .json({ success: true, message: "Usuário atualizado com sucesso", data });
  } catch (error) {
    next(error);
  }
}

/** Remove um usuário sem vínculos. */
export async function remove(req, res, next) {
  try {
    const data = await userService.deleteUser(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Usuário removido com sucesso", data });
  } catch (error) {
    next(error);
  }
}
