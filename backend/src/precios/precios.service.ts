import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CrearPrecioKgDto } from './dto/precio-kg.dto';

@Injectable()
export class PreciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Historial completo, del más reciente al más antiguo */
  historial() {
    return this.prisma.precioKg.findMany({ orderBy: [{ vigenteDesde: 'desc' }, { id: 'desc' }] });
  }

  /** Precio general vigente en una fecha (por defecto hoy, hora de Chile) */
  vigente(fecha: string = hoySantiago()) {
    return this.prisma.precioKg.findFirst({
      where: { vigenteDesde: { lte: fechaDesdeISO(fecha) } },
      orderBy: [{ vigenteDesde: 'desc' }, { id: 'desc' }],
    });
  }

  async crear(dto: CrearPrecioKgDto, usuarioId?: number) {
    const anterior = await this.vigente();
    const creado = await this.prisma.precioKg.create({
      data: {
        valor: dto.valor,
        vigenteDesde: fechaDesdeISO(dto.vigenteDesde ?? hoySantiago()),
        creadoPorId: usuarioId ?? null,
      },
    });
    await this.audit.registrarCambio(usuarioId, 'CREAR', 'precio_kg', creado.id, anterior, creado);
    return creado;
  }
}
