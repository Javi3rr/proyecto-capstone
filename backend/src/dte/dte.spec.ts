import { calcularFactura } from '../facturacion/calculo';
import { ConfigDte, ModoDte, nombreAmbiente } from './dte.config';
import { armarFactura33 } from './factura33';
import { armarGuia52, ClienteReceptor, datosTrasladoFaltantes } from './guia52';
import { armarNotaCredito61 } from './notaCredito61';

const config = (modo: ModoDte = 'pruebas', preciosConIva = true): ConfigDte => ({
  modo,
  apiUrl: 'https://ejemplo.invalid',
  apiKey: 'llave',
  emisor: {
    rut: '76795561-8',
    razonSocial: 'PANADERIA DE PRUEBA',
    giro: 'PANADERIA',
    acteco: 107100,
    direccion: 'CALLE 123',
    comuna: 'Curicó',
    sucursal: null,
  },
  preciosConIva,
  receptorPrueba: { rut: '76430498-5', razonSocial: 'RECEPTOR PRUEBA', giro: 'SERVICIOS', comuna: 'Curicó', direccion: 'PRAT 527' },
});

const clienteConRut: ClienteReceptor = {
  nombre: 'Pilar',
  rut: '12345678-5',
  razonSocial: 'Pilar Pérez',
  giro: null,
  direccion: 'Los Aromos 45',
  comuna: 'Molina',
};
const clienteSinRut = { ...clienteConRut, rut: null };

/** Factura de octubre: 30 guías a $1.700 (con 1 kg sin costo) y 3 a $1.800 */
const calculo = calcularFactura(
  [
    ...Array.from({ length: 30 }, () => ({ kg: 10, kgDescuento: 1, precioKg: 1700, monto: 15300 })),
    ...Array.from({ length: 3 }, () => ({ kg: 12.5, kgDescuento: 0, precioKg: 1800, monto: 22500 })),
  ],
  true,
);

const factura = (guias: { folio: number; fecha: Date }[], cliente = clienteConRut) => ({
  id: 7,
  fechaEmision: new Date('2026-10-31'),
  periodo: new Date('2026-10-01'),
  ...calculo,
  cliente,
  guias,
});

describe('armarFactura33 (factura electrónica)', () => {
  it('arma una factura tipo 33 con una línea por precio y los totales del cálculo', () => {
    const { dte, totales } = armarFactura33(factura([]), config());
    const enc = dte.Encabezado;

    expect(enc.IdDoc).toEqual({ TipoDTE: 33, Folio: 0, FchEmis: '2026-10-31' });
    expect(enc.Totales).toEqual({ MntNeto: 442437, TasaIVA: '19', IVA: 84063, MntTotal: 526500 });
    expect(totales).toEqual({ neto: 442437, iva: 84063, total: 526500 });
    expect(dte.Detalle).toHaveLength(2);
    expect(dte.Detalle[0]).toMatchObject({ NroLinDet: 1, NmbItem: 'PAN (KG)', QtyItem: 270, PrcItem: 1428.57, MontoItem: 385714 });
    // La suma de las líneas cuadra con el neto (el SII lo valida)
    expect(dte.Detalle.reduce((s, l) => s + l.MontoItem, 0)).toBe(enc.Totales.MntNeto);
  });

  it('referencia cada guía de despacho (DTE 52) por folio, en orden', () => {
    const { dte } = armarFactura33(
      factura([
        { folio: 12, fecha: new Date('2026-10-02') },
        { folio: 11, fecha: new Date('2026-10-01') },
      ]),
      config(),
    );
    expect(dte.Referencia).toEqual([
      { NroLinRef: 1, TpoDocRef: '52', FolioRef: 11, FchRef: '2026-10-01' },
      { NroLinRef: 2, TpoDocRef: '52', FolioRef: 12, FchRef: '2026-10-02' },
    ]);
  });

  it('con más de 40 guías usa una sola referencia global (límite del SII)', () => {
    const guias = Array.from({ length: 45 }, (_, i) => ({ folio: 100 + i, fecha: new Date('2026-10-05') }));
    const { dte } = armarFactura33(factura(guias), config());
    expect(dte.Referencia).toHaveLength(1);
    expect(dte.Referencia![0]).toMatchObject({ TpoDocRef: '52', IndGlobal: 1, FolioRef: 0 });
    expect((dte.Referencia![0] as { RazonRef: string }).RazonRef).toContain('folios 100 al 144 (45)');
  });

  it('usa los datos tributarios del cliente como receptor', () => {
    const { dte, receptorDePrueba } = armarFactura33(factura([]), config());
    expect(receptorDePrueba).toBe(false);
    expect(dte.Encabezado.Receptor).toMatchObject({ RUTRecep: '12345678-5', RznSocRecep: 'Pilar Pérez', GiroRecep: 'PARTICULAR' });
  });

  it('fuera de producción, a un cliente sin RUT le pone el receptor de prueba', () => {
    const { dte, receptorDePrueba } = armarFactura33(factura([], clienteSinRut), config('pruebas'));
    expect(receptorDePrueba).toBe(true);
    expect(dte.Encabezado.Receptor.RUTRecep).toBe('76430498-5');
  });

  it('en producción no permite facturar a un cliente sin RUT', () => {
    expect(() => armarFactura33(factura([], clienteSinRut), config('produccion'))).toThrow(/no tiene RUT/);
  });

  it('no permite una factura sin kg cobrados', () => {
    const vacia = { ...factura([]), lineas: [{ precioKg: 1700, precioNeto: 1428.57, kg: 0, guias: 1, neto: 0 }] };
    expect(() => armarFactura33(vacia, config())).toThrow(/no tiene kg cobrados/);
  });
});

describe('armarNotaCredito61 (nota de crédito que anula la factura)', () => {
  const nota = armarNotaCredito61(
    {
      fecha: new Date('2026-11-03'),
      motivo: 'Error en los kg de una guía',
      cliente: clienteConRut,
      factura: { folio: 203777, fechaEmision: new Date('2026-10-31'), periodo: new Date('2026-10-01'), ...calculo },
    },
    config(),
  );
  const facturaOriginal = armarFactura33(factura([]), config()).dte;

  it('es un DTE tipo 61 con fecha de hoy', () => {
    expect(nota.dte.Encabezado.IdDoc).toEqual({ TipoDTE: 61, Folio: 0, FchEmis: '2026-11-03' });
  });

  it('anula la factura: referencia su folio con CodRef 1 y el motivo', () => {
    expect(nota.dte.Referencia).toEqual([
      {
        NroLinRef: 1,
        TpoDocRef: '33',
        FolioRef: 203777,
        FchRef: '2026-10-31',
        CodRef: 1,
        RazonRef: 'ANULA FACTURA: Error en los kg de una guía',
      },
    ]);
  });

  it('repite el detalle, el receptor y los montos de la factura que anula', () => {
    expect(nota.dte.Detalle).toEqual(facturaOriginal.Detalle);
    expect(nota.dte.Encabezado.Receptor).toEqual(facturaOriginal.Encabezado.Receptor);
    expect(nota.dte.Encabezado.Totales).toEqual(facturaOriginal.Encabezado.Totales);
  });

  it('recorta el motivo al largo máximo del SII (90 caracteres)', () => {
    const larga = armarNotaCredito61(
      { fecha: new Date('2026-11-03'), motivo: 'x'.repeat(200), cliente: clienteConRut, factura: { folio: 1, fechaEmision: new Date('2026-10-31'), periodo: new Date('2026-10-01'), ...calculo } },
      config(),
    );
    expect(larga.dte.Referencia[0].RazonRef).toHaveLength(90);
  });
});

describe('armarGuia52 (guía de despacho electrónica)', () => {
  const guia = {
    id: 125,
    fecha: new Date('2026-10-04'),
    vuelta: 1,
    kg: 10,
    kgDescuento: 1,
    precioKg: 1700,
    monto: 15300,
    cliente: { ...clienteConRut, modalidad: 'REPARTO' as const },
    repartidor: { nombre: 'Carlos', rut: '11111111-1', patente: 'ABCD12' },
  };

  it('cobra los kg menos el descuento al precio neto y desglosa el IVA', () => {
    const { dte, totales } = armarGuia52(guia, config());
    expect(dte.Encabezado.IdDoc).toMatchObject({ TipoDTE: 52, IndTraslado: 1, TipoDespacho: 2 });
    expect(dte.Detalle[0]).toMatchObject({ QtyItem: 9, PrcItem: 1428.57, MontoItem: 12857 });
    expect(totales).toEqual({ neto: 12857, iva: 2443, total: 15300 });
  });

  it('un cliente presencial retira por su cuenta (TipoDespacho 1, sin transporte, Res. 144 resolutivo 15°)', () => {
    const { dte, avisos } = armarGuia52({ ...guia, cliente: { ...guia.cliente, modalidad: 'PRESENCIAL' } }, config('produccion'));
    expect(dte.Encabezado.IdDoc.TipoDespacho).toBe(1);
    expect(dte.Encabezado).not.toHaveProperty('Transporte');
    expect(avisos).toEqual([]);
  });

  describe('datos del traslado (Res. SII 144/2026)', () => {
    // 04-10-2026 11:30 UTC = 08:30 en Santiago (horario de verano, UTC-3)
    const salidaMismoDia = new Date('2026-10-04T11:30:00Z');

    it('informa chofer, patente, RUT del transportista (la empresa), destino y fechas de salida y llegada', () => {
      const { dte, avisos } = armarGuia52(guia, config('produccion'), salidaMismoDia);
      expect(dte.Encabezado.Transporte).toEqual({
        Patente: 'ABCD12',
        RUTTrans: '76795561-8',
        Chofer: { RUTChofer: '11111111-1', NombreChofer: 'Carlos' },
        DirDest: 'Los Aromos 45',
        CmnaDest: 'Molina',
        FchSalida: '2026-10-04',
        HraSalida: '08:30:00',
        FchLlegada: '2026-10-04',
      });
      expect(avisos).toEqual([]);
    });

    it('la hora de salida (opcional) solo se informa si se emite el mismo día del reparto', () => {
      const { dte } = armarGuia52(guia, config(), new Date('2026-10-06T12:00:00Z'));
      expect(dte.Encabezado.Transporte).toMatchObject({ FchSalida: '2026-10-04', FchLlegada: '2026-10-04' });
      expect(dte.Encabezado.Transporte).not.toHaveProperty('HraSalida');
    });

    it('normaliza la patente (sin guion ni espacios, en mayúscula)', () => {
      const { dte } = armarGuia52({ ...guia, repartidor: { ...guia.repartidor, patente: 'ab-cd 12' } }, config());
      expect(dte.Encabezado.Transporte).toMatchObject({ Patente: 'ABCD12' });
    });

    const sinDatos = {
      ...guia,
      cliente: { ...guia.cliente, direccion: null, comuna: null },
      repartidor: { nombre: 'José', rut: null, patente: null },
    };

    it('en producción no emite una guía de reparto si faltan datos del traslado', () => {
      expect(() => armarGuia52(sinDatos, config('produccion'))).toThrow(
        'Faltan datos del traslado que exige el SII (Res. 144/2026) para la guía N° 125: RUT del chofer José, ' +
          'patente del furgón de José, dirección del cliente Pilar, comuna del cliente Pilar.',
      );
    });

    it('fuera de producción la emite sin esos datos y deja un aviso', () => {
      const { dte, avisos } = armarGuia52(sinDatos, config('pruebas'));
      expect(dte.Encabezado.Transporte).not.toHaveProperty('Chofer');
      expect(dte.Encabezado.Transporte).not.toHaveProperty('Patente');
      expect(dte.Encabezado.Transporte).toMatchObject({ RUTTrans: '76795561-8', FchSalida: '2026-10-04' });
      expect(avisos[0]).toMatch(/^Faltan datos del traslado \(Res\. 144\/2026\): RUT del chofer José/);
    });

    it('una guía de reparto sin repartidor asignado también es un dato faltante', () => {
      expect(datosTrasladoFaltantes({ cliente: guia.cliente, repartidor: null })).toEqual(['repartidor (chofer y patente)']);
    });
  });
});

describe('nombreAmbiente', () => {
  it('corresponde al dteAmbiente que se guarda en cada documento', () => {
    expect(nombreAmbiente('simulado')).toBe('SIMULADO');
    expect(nombreAmbiente('pruebas')).toBe('PRUEBAS');
    expect(nombreAmbiente('produccion')).toBe('PRODUCCION');
  });
});
