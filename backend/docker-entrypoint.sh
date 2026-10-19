#!/bin/sh
set -e

echo "[patopan-api] Aplicando esquema de base de datos..."
if ls prisma/migrations/*/migration.sql >/dev/null 2>&1; then
  # Hay migraciones versionadas: se aplican en orden
  npx prisma migrate deploy
else
  # Aún no se ha generado la primera migración: se sincroniza el esquema directamente
  echo "[patopan-api] No hay migraciones en prisma/migrations -> usando 'prisma db push'"
  npx prisma db push --skip-generate
fi

if [ "$SEED_ON_START" = "true" ]; then
  echo "[patopan-api] Cargando datos iniciales..."
  node prisma/seed.js
fi

echo "[patopan-api] Iniciando API en puerto ${PORT:-3000}"
exec node dist/main.js
