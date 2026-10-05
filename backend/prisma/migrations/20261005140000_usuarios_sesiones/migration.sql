-- Gestión de usuarios: invalidar sesiones abiertas y registrar el último acceso
ALTER TABLE "usuarios" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "usuarios" ADD COLUMN "ultimo_acceso" TIMESTAMP(3);
