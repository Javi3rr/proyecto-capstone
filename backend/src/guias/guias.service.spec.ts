import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuiasService } from './guias.service';

/** Guía vigente de ejemplo; cada prueba cambia lo que necesita */
const guiaBase = {
  id: 2,
  estado: 'VIGENTE',
  facturaMensualId: null as number | null,
  dteEstado: 'NO_ENVIADA',
  dteAmbiente: null as string | null,
  dteFolio: null as number | null,
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
    expect(data).not.toHaveProperty('dteAnuladaEn');
  });

  it('con folio SII exige confirmar que se anuló en el portal', async () => {
    const { guias, update } = servicio({ ...guiaBase, dteEstado: 'EMITIDA', dteAmbiente: 'PRUEBAS', dteFolio: 103663 });
    await expect(guias.anular(2, 'Kg mal digitados', 1)).rejects.toThrow(BadRequestException);
    await expect(guias.anular(2, 'Kg mal digitados', 1)).rejects.toThrow(/folio 103663/);
    expect(update).not.toHaveBeenCalled();
  });

  it('con folio SII y la confirmación, la anula y registra quién confirmó la anulación en el SII', async () => {
    const { guias, update } = servicio({ ...guiaBase, dteEstado: 'EMITIDA', dteAmbiente: 'PRODUCCION', dteFolio: 501 });
    await guias.anular(2, 'Kg mal digitados', 7, true);
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({ estado: 'ANULADA', dteAnuladaPorId: 7 });
    expect(data.dteAnuladaEn).toBeInstanceOf(Date);
  });

  it('un folio del modo simulado no existe en el SII: no pide confirmación', async () => {
    const { guias, update } = servicio({ ...guiaBase, dteEstado: 'EMITIDA', dteAmbiente: 'SIMULADO', dteFolio: 1 });
    await guias.anular(2, 'Kg mal digitados', 1);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('dteAnuladaEn');
  });

  it('no anula una guía incluida en una factura mensual vigente', async () => {
    const { guias } = servicio({ ...guiaBase, facturaMensualId: 3 });
    await expect(guias.anular(2, 'Kg mal digitados', 1, true)).rejects.toThrow(ConflictException);
  });

  it('no anula dos veces', async () => {
    const { guias } = servicio({ ...guiaBase, estado: 'ANULADA' });
    await expect(guias.anular(2, 'Kg mal digitados', 1)).rejects.toThrow(/ya está anulada/);
  });
});
