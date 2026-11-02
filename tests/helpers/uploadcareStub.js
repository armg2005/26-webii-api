import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * Simula somente o contrato HTTP base/info usado pelo SDK; nunca chama a rede externa.
 * @param {number} port - Zero escolhe uma porta livre para a suíte de integração.
 * @returns {Promise<object>} URL, registros de upload e método de encerramento.
 */
export async function startUploadcareStub(port = 0) {
  const uploads = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && url.pathname === "/stats") {
      return res.end(JSON.stringify({ uploads: uploads.length }));
    }
    if (req.method === "POST" && url.pathname === "/base/") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      uploads.push(body);
      if (body.includes(Buffer.from("UPLOADCARE_FAILURE"))) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            error: {
              content: "sensitive-provider-detail",
              error_code: "INVALID_FILE",
            },
          }),
        );
      }
      return res.end(JSON.stringify({ file: randomUUID() }));
    }
    if (req.method === "GET" && url.pathname === "/info/") {
      return res.end(
        JSON.stringify({
          uuid: url.searchParams.get("file_id"),
          filename: "image.png",
          original_filename: "image.png",
          size: 68,
          is_stored: true,
          is_ready: true,
          is_image: true,
          mime_type: "image/png",
          image_info: null,
        }),
      );
    }
    res.statusCode = 404;
    res.end(
      JSON.stringify({ error: "Operação fora do contrato do simulador" }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    uploads,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}