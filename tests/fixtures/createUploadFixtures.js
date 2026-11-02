import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Cria entradas determinísticas; os arquivos gerados não precisam ser versionados. */
export async function createUploadFixtures() {
  const directory = new URL("./upload/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=",
    "base64",
  );
  const data = {
    image,
    empty: Buffer.alloc(0),
    invalid: Buffer.from("Um documento de texto, não uma imagem"),
    limit: Buffer.concat([image, Buffer.alloc(5 * 1024 * 1024 - image.length)]),
    large: Buffer.concat([
      image,
      Buffer.alloc(5 * 1024 * 1024 + 1 - image.length),
    ]),
    failure: Buffer.concat([image, Buffer.from("UPLOADCARE_FAILURE")]),
  };
  const paths = {};
  for (const [name, content] of Object.entries(data)) {
    const file = new URL(
      `${name}.${name === "invalid" ? "txt" : "png"}`,
      directory,
    );
    await writeFile(file, content);
    paths[name] = fileURLToPath(file);
  }
  return paths;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await createUploadFixtures();
  console.log("Fixtures de upload criadas em tests/fixtures/upload");
}