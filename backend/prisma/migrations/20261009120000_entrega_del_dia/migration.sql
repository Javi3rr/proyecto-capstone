-- Entrega del día: reemplaza el cuadre con pagos y saldos

-- Repartidor que cobra el pago del día siguiente (null = el mismo que reparte)
ALTER TABLE "clientes" ADD COLUMN "cobrador_id" INTEGER;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_cobrador_id_fkey" FOREIGN KEY ("cobrador_id") REFERENCES "repartidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Día en que un solo repartidor hace todo el reparto
ALTER TABLE "jornadas_despacho" ADD COLUMN "repartidor_unico_id" INTEGER;
ALTER TABLE "jornadas_despacho" ADD CONSTRAINT "jornadas_despacho_repartidor_unico_id_fkey" FOREIGN KEY ("repartidor_unico_id") REFERENCES "repartidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Excepciones: el cliente no pagó ese día
CREATE TABLE "no_pagos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" VARCHAR(200),
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "no_pagos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "no_pagos_cliente_id_fecha_key" ON "no_pagos"("cliente_id", "fecha");
ALTER TABLE "no_pagos" ADD CONSTRAINT "no_pagos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
