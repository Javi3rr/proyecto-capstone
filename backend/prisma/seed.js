/* eslint-disable no-console */
// ------------------------------------------------------------
//  Datos iniciales (idempotente: se puede ejecutar varias veces)
//  - Usuarios iniciales (admin, meson, despachador)
//  - Repartidores 1 y 2
//  - Clientes del cuaderno actual, en el mismo orden
// ------------------------------------------------------------
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const USUARIOS = [
  { username: 'admin', nombre: 'Administrador Patopan', rol: 'ADMIN', password: 'adminpatopan' },
  { username: 'meson', nombre: 'Mesón', rol: 'MESON', password: 'mesonpatopan' },
  { username: 'despachador', nombre: 'Despachador', rol: 'DESPACHO', password: 'despachadorpatopan' },
];

const REPARTIDORES = ['Repartidor 1', 'Repartidor 2'];

// Según el cuaderno: los de "pago día siguiente" se cobran con los clientes del Repartidor 2
const CLIENTES = {
  PAGO_DIA_SIGUIENTE: {
    repartidor: 'Repartidor 2',
    nombres: ['Pilar', 'Mary', 'Suegra', 'Santa', 'Santillana', 'Drake', 'Lorena'],
  },
  REPARTO_1: {
    modalidad: 'REPARTO',
    repartidor: 'Repartidor 1',
    nombres: [
      'Isla', 'Margarita', 'Amasandería', 'Laguna', 'Maritza', 'Domingo', 'Julio',
      'Anita', 'Elvin', 'Picaflor', 'Varas', 'Copec', 'Oficina', 'Sanguchera',
    ],
  },
  REPARTO_2: {
    modalidad: 'REPARTO',
    repartidor: 'Repartidor 2',
    nombres: [
      'Monte', 'Jumbito', 'Pedro Gallo', 'Nuevo2', 'Aguila', 'Dania', 'Lebreles',
      'Tucson', 'Horacio', 'Tutin', 'Aguila2', 'Andrés', 'Valentina',
    ],
  },
  PRESENCIAL: {
    repartidor: null,
    nombres: ['Santa Elena', 'Señora María', 'Luis Soto', 'Eliana', 'Leo', 'Varas2'],
  },
};

async function main() {
  // Usuarios (no se sobrescribe la contraseña si el usuario ya existe)
  for (const u of USUARIOS) {
    await prisma.usuario.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        nombre: u.nombre,
        rol: u.rol,
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
  }

  // Repartidores
  const repartidorIds = {};
  for (const nombre of REPARTIDORES) {
    let r = await prisma.repartidor.findFirst({ where: { nombre } });
    if (!r) r = await prisma.repartidor.create({ data: { nombre } });
    repartidorIds[nombre] = r.id;
  }

  // Clientes
  let orden = 0;
  for (const [grupo, def] of Object.entries(CLIENTES)) {
    const modalidad = def.modalidad ?? grupo;
    for (const nombre of def.nombres) {
      orden += 10;
      await prisma.cliente.upsert({
        where: { nombre_modalidad: { nombre, modalidad } },
        update: {},
        create: {
          nombre,
          modalidad,
          orden,
          repartidorId: def.repartidor ? repartidorIds[def.repartidor] : null,
        },
      });
    }
  }

  const [usuarios, clientes] = await Promise.all([prisma.usuario.count(), prisma.cliente.count()]);
  console.log(`[seed] OK -> usuarios: ${usuarios}, clientes: ${clientes}`);
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
