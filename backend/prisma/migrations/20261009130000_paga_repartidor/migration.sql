-- Paga diaria de los repartidores (se descuenta de la Entrega del día)
ALTER TABLE "repartidores" ADD COLUMN "paga_diaria" DECIMAL(10,2) NOT NULL DEFAULT 20000;

CREATE TABLE "pagas_repartidor" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "repartidor_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "creado_por_id" INTEGER,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagas_repartidor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pagas_repartidor_fecha_repartidor_id_key" ON "pagas_repartidor"("fecha", "repartidor_id");
ALTER TABLE "pagas_repartidor" ADD CONSTRAINT "pagas_repartidor_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "repartidores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
