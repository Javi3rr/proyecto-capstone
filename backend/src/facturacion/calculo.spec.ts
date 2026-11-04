import { calcularFactura, plazoLegal } from './calculo';

/** Guía de ejemplo con los valores como vienen de la base de datos (Decimal serializado a texto) */
const guia = (kg: string, kgDescuento: string, precioKg: string, monto: string) => ({ kg, kgDescuento, precioKg, monto });

describe('calcularFactura', () => {
  it('con precio con IVA: desglosa el neto con el precio ÷ 1,19 y suma el 19 % de IVA', () => {
    // 300 kg a $1.700 con IVA (30 guías de 10 kg) -> precio neto $1.428,57
    const guias = Array.from({ length: 30 }, () => guia('10.000', '0', '1700.00', '17000.00'));
    const c = calcularFactura(guias, true);

    expect(c.lineas).toEqual([{ precioKg: 1700, precioNeto: 1428.57, kg: 300, guias: 30, neto: 428571 }]);
    expect(c.neto).toBe(428571);
    expect(c.iva).toBe(81428);
    expect(c.total).toBe(509999);
    // Lo cobrado en las guías: la diferencia de $1 es solo el redondeo del precio neto
    expect(c.montoGuias).toBe(510000);
  });

  it('agrupa por precio del kg (cambio de precio a mitad de mes) y descuenta los kg sin costo', () => {
    const guias = [
      ...Array.from({ length: 30 }, () => guia('10.000', '1.000', '1700.00', '15300.00')),
      ...Array.from({ length: 3 }, () => guia('12.500', '0', '1800.00', '22500.00')),
    ];
    const c = calcularFactura(guias, true);

    expect(c.lineas).toHaveLength(2);
    expect(c.lineas[0]).toMatchObject({ precioKg: 1700, kg: 270, guias: 30, neto: 385714 }); // 270 × 1.428,57
    expect(c.lineas[1]).toMatchObject({ precioKg: 1800, kg: 37.5, guias: 3, neto: 56723 }); // 37,5 × 1.512,61
    expect(c.kg).toBe(307.5);
    expect(c.neto).toBe(442437);
    expect(c.iva).toBe(84063);
    expect(c.total).toBe(526500);
    expect(c.montoGuias).toBe(526500);
  });

  it('ordena las líneas por precio aunque las guías vengan desordenadas', () => {
    const c = calcularFactura([guia('1', '0', '1800', '1800'), guia('1', '0', '1700', '1700')], true);
    expect(c.lineas.map((l) => l.precioKg)).toEqual([1700, 1800]);
  });

  it('con precio neto: no divide por 1,19 y agrega el IVA encima', () => {
    const c = calcularFactura([guia('10', '0', '1000', '10000')], false);
    expect(c.lineas[0].precioNeto).toBe(1000);
    expect(c).toMatchObject({ neto: 10000, iva: 1900, total: 11900 });
  });

  it('nunca cobra kg negativos si el descuento supera lo despachado', () => {
    const c = calcularFactura([guia('0.500', '1.000', '1700', '0')], true);
    expect(c.kg).toBe(0);
    expect(c.neto).toBe(0);
  });

  it('sin guías devuelve todo en cero', () => {
    expect(calcularFactura([], true)).toEqual({ lineas: [], kg: 0, montoGuias: 0, neto: 0, iva: 0, total: 0 });
  });

  it('suma kg con decimales sin errores de punto flotante', () => {
    const c = calcularFactura([guia('0.1', '0', '1000', '100'), guia('0.2', '0', '1000', '200')], false);
    expect(c.kg).toBe(0.3);
  });
});

describe('plazoLegal', () => {
  it('es el día 10 del mes siguiente', () => {
    expect(plazoLegal('2026-10')).toBe('2026-11-10');
  });

  it('en diciembre pasa al año siguiente', () => {
    expect(plazoLegal('2026-12')).toBe('2027-01-10');
  });
});
