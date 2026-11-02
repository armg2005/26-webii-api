import { randomUUID } from "node:crypto";
import { UploadClient } from "@uploadcare/upload-client";
import { AppError, ValidationError } from "../../../errors/AppError.js";

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Envia um Buffer ao Uploadcare e devolve a URL calculada pelo SDK.
 * @param {Buffer} buffer - Bytes mantidos na memória pelo Multer.
 * @param {string} mimeType - Tipo permitido pelo filtro da rota.
 * @returns {Promise<string>} URL pública do arquivo armazenado.
 */
export async function uploadToUploadcare(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError("Arquivo vazio ou inválido");
  }
  const publicKey = process.env.UPLOADCARE_PUBLIC_KEY;
  if (!publicKey) {
    throw new AppError(
      "Upload não configurado no servidor",
      503,
      "UPLOAD_NOT_CONFIGURED",
    );
  }
  // A avaliação usa HTTP local; produção sempre usa o endpoint padrão do SDK.
  const testBaseURL =
    process.env.NODE_ENV === "test"
      ? process.env.UPLOADCARE_TEST_BASE_URL
      : undefined;
      
  const client = new UploadClient({
    publicKey,
    ...(testBaseURL && { baseURL: testBaseURL }),
  });
  
  try {
    const file = await client.uploadFile(buffer, {
      fileName: `${randomUUID()}.${extensions[mimeType]}`,
      contentType: mimeType,
      store: true,
      signal: AbortSignal.timeout(10000),
    });
    return file.cdnUrl;
  } catch {
    // Não devolver detalhes, tokens ou mensagens internas do provedor.
    throw new AppError(
      "Serviço de upload indisponível",
      502,
      "UPLOAD_SERVICE_UNAVAILABLE",
    );
  }
}