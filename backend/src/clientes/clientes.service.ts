import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Clientes activos en el orden de la planilla (igual al cuaderno) */
  listar() {
    return this.prisma.cliente.findMany({
      where: { activo: true },
      include: { repartidor: { select: { id: true, nombre: true } } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }
}
