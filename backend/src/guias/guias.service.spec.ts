import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuiasService } from './guias.service';

/** Documento SII de una guía (tabla documentos_sii); null = guía solo interna */
type Documento = { estado: 'EMITIDA' | 'RECHAZADA' | 'NO_ENVIADA'; ambiente: string; folio: number } | null;

/** Guía vigente de ejemplo con la forma de la base normalizada; cada prueba cambia lo que necesita */
const guiaBase = {
  id: 2,
  estado: 'VIGENTE',
  facturaMensualId: null as number | null,
  impresiones: 0,
  documentoSii: null as Documento,
  despacho: {
    vuelta: 1,
    clienteId: 4,
    repartidorId: 2,
    jornada: { fecha: new Date('2026-10-22') },
    cliente: { id: 4, nombre: 'Pilar', modalidad: 'PAGO_DIA_SIGUIENTE', direccion: null },
    repartidor: { id: 2, nombre: 'Carlos', patente: null },
  },
};

function servicio(guia: typeof guiaBase) {
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...guia, ...data }));
  const prisma = { guia: { findUnique: jest.fn(async () => guia), update } } as unknown as PrismaService;
  const audit = { registrarCambio: jest.fn() } as unknown as AuditService;
  return { guias: new GuiasService(prisma, audit), update };
}

describe('GuiasService.anular', () => {
  it('anula una guía interna (sin folio SII) sin pedir confirmación', async () => {
    const { guias, update } = servicio(guiaBase);
    await guias.anular(2, 'Kg mal digitados', 1);
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({ estado: 'ANULADA', motivoAnulacion: 'Kg mal digitados', anuladaPorId: 1 });
    expect(data).not.toHaveProperty('documentoSii');
  });

  it('con folio SII exige confirmar que se anuló en el portal', async () => {
    const { guias, update } = servicio({ ...guiaBase, documentoSii: { estado: 'EMITIDA', ambiente: 'PRUEBAS', folio: 103663 } });
    await expect(guias.anular(2, 'Kg mal digitados', 1)).rejects.toThrow(BadRequestException);
    await expect(guias.anular(2, 'Kg mal digitados', 1)).rejects.toThrow(/folio 103663/);
    expect(update).not.toHaveBeenCalled();
  });

  it('con folio SII y la confirmación, la anula y registra en su documento SII quién confirmó la anulación', async () => {
    const { guias, update } = servicio({ ...guiaBase, documentoSii: { estado: 'EMITIDA', ambiente: 'PRODUCCION', folio: 501 } });
    await guias.anular(2, 'Kg mal digitados', 7, true);
    const data = update.mock.calls[0][0].data as { estado: string; documentoSii: { update: { anuladoEn: Date; anuladoPorId: number } } };
    expect(data.estado).toBe('ANULADA');
    expect(data.documentoSii.update.anuladoPorId).toBe(7);
    expect(data.documentoSii.update.anuladoEn).toBeInstanceOf(Date);
  });

  it('un folio del modo simulado no existe en el SII: no pide confirmación', async () => {
    const { guias, update } = servicio({ ...guiaBase, documentoSii: { estado: 'EMITIDA', ambiente: 'SIMULADO', folio: 1 } });
    await guias.anular(2, 'Kg mal digitados', 1);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('documentoSii');
  });

  it('no anula una guía incluida en una factura mensual vigente', async () => {
    const { guias } = servicio({ ...guiaBase, facturaMensualId: 3 });
    await expect(guias.anular(2, 'Kg mal digitados', 1, true)).rejects.toThrow(ConflictException);
  });

  it('no anula dos veces', async () => {
    const { guias } = servicio({ ...guiaBase, estado: 'ANULADA' });
    await expect(guias.anular(2, 'Kg mal digitados', 1)).rejects.toThrow(/ya está anulada/);
  });

  it('entrega la guía con fecha, vuelta, cliente y datos SII al nivel de la guía (forma de la API)', async () => {
    const { guias } = servicio({ ...guiaBase, documentoSii: { estado: 'EMITIDA', ambiente: 'PRUEBAS', folio: 103664 } });
    const g = await guias.obtener(2);
    expect(g).toMatchObject({ vuelta: 1, clienteId: 4, cliente: { nombre: 'Pilar' }, dteEstado: 'EMITIDA', dteFolio: 103664 });
    expect(g.fecha).toEqual(new Date('2026-10-22'));
  });
});

describe('GuiasService.emitir (guía de una línea de la planilla)', () => {
  const despacho = (guias: { id: number; estado: string }[]) => ({
    id: 9,
    clienteId: 4,
    repartidorId: 2,
    vuelta: 1,
    kg: 12,
    kgDescuento: 0,
    precioKg: 1700,
    jornada: { fecha: new Date('2026-11-16') },
    guias,
  });

  function conDespacho(d: ReturnType<typeof despacho>) {
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 30, ...data }));
    const prisma = {
      despacho: { findUnique: jest.fn(async () => d) },
      guia: { create, findUnique: jest.fn(async () => ({ ...guiaBase, id: 30 })) },
    } as unknown as PrismaService;
    const audit = { registrarCambio: jest.fn() } as unknown as AuditService;
    return { guias: new GuiasService(prisma, audit), create };
  }

  it('la primera guía de la vuelta no reemplaza a ninguna y calcula su monto (kg × precio)', async () => {
    const { guias, create } = conDespacho(despacho([]));
    await guias.emitir(9, 1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ reemplazaAId: null, despachoId: 9, kg: 12 });
    expect(data.monto).toBe(20400);
    // Normalizado: la guía no repite cliente, repartidor, fecha ni vuelta del despacho
    expect(data).not.toHaveProperty('clienteId');
    expect(data).not.toHaveProperty('fecha');
  });

  it('después de anular para corregir los kg, la guía nueva reemplaza a la última anulada', async () => {
    const { guias, create } = conDespacho(
      despacho([
        { id: 12, estado: 'ANULADA' },
        { id: 25, estado: 'ANULADA' },
      ]),
    );
    await guias.emitir(9, 1);
    expect(create.mock.calls[0][0].data).toMatchObject({ reemplazaAId: 25 });
  });

  it('no crea otra guía si ya hay una vigente', async () => {
    const { guias, create } = conDespacho(despacho([{ id: 25, estado: 'VIGENTE' }]));
    await expect(guias.emitir(9, 1)).rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
});
