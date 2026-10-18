-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('professor', 'admin');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "primeiro_nome" TEXT,
ADD COLUMN     "sobrenome" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "tipo_usuario" "TipoUsuario";
