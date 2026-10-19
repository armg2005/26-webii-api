// ADICIONADO: middleware compartilhável entre versões; não montar nesta aula.
/**
 * Cria um middleware para anunciar futura descontinuação sem desativar a rota.
 * @param {{deprecatedAt?: Date, sunset?: Date, link?: string}} [options={}] - Política de migração. Sem data, permanece desligado.
 * @returns {import("express").RequestHandler} Middleware configurado.
 */
export function createDeprecationMiddleware(options = {}) {
  return (_req, res, next) => {
    if (!options.deprecatedAt) return next();
    // RFC 9745: data estruturada em segundos Unix, não o booleano true.
    res.set(
      "Deprecation",
      `@${Math.floor(options.deprecatedAt.getTime() / 1000)}`,
    );
    if (options.sunset) res.set("Sunset", options.sunset.toUTCString());
    if (options.link) res.set("Link", `<${options.link}>; rel="deprecation"`);
    next();
  };
}
