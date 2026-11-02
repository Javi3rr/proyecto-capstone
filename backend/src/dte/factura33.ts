import type { LineaFactura } from '../facturacion/calculo';
import { ConfigDte } from './dte.config';
import { ClienteReceptor, corto, emisorDte, receptorDte } from './guia52';

/** Datos de una factura mensual necesarios para armar el DTE 33 */
export interface FacturaParaDte {
  id: number;
  fechaEmision: Date;
  periodo: Date;
  lineas: LineaFactura[];
  neto: number;
  iva: number;
  total: number;
  cliente: ClienteReceptor;
  /** Guías electrónicas (DTE 52) que respalda la factura */
  guias: { folio: number; fecha: Date }[];
}

/** El SII acepta hasta 40 referencias; con más guías se usa una referencia global */
const MAX_REFERENCIAS = 40;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Arma la factura electrónica (DTE tipo 33) de fin de mes, en el formato SII en JSON.
 *
 *  - Una línea de detalle por precio del kg, con la cantidad total de kg cobrados en el mes.
 *  - Referencia las guías de despacho (DTE 52) que factura, como exige el art. 55 de la Ley del IVA.
 *    Si son más de 40, se hace una sola referencia global (IndGlobal = 1, FolioRef = 0).
 */
export function armarFactura33(f: FacturaParaDte, c: ConfigDte) {
  const { receptor, dePrueba } = receptorDte(f.cliente, c, 'factura electrónica');
  const mes = iso(f.periodo).slice(0, 7).split('-').reverse().join('/');

  const detalle = f.lineas
    .filter((l) => l.kg > 0)
    .map((l, i) => ({
      NroLinDet: i + 1,
      NmbItem: 'PAN (KG)',
      DscItem: corto(
        `Pan despachado en ${mes} · ${l.guias} guía(s) · $${l.precioKg}/kg${c.preciosConIva ? ' IVA incluido' : ''}`,
        1000,
      ),
      QtyItem: l.kg,
      UnmdItem: 'KG',
      PrcItem: l.precioNeto,
      MontoItem: l.neto,
    }));
  if (detalle.length === 0) throw new Error('La factura no tiene kg cobrados.');

  const guias = [...f.guias].sort((a, b) => a.folio - b.folio);
  const referencias =
    guias.length <= MAX_REFERENCIAS
      ? guias.map((g, i) => ({ NroLinRef: i + 1, TpoDocRef: '52', FolioRef: g.folio, FchRef: iso(g.fecha) }))
      : [
          {
            NroLinRef: 1,
            TpoDocRef: '52',
            IndGlobal: 1,
            FolioRef: 0,
            FchRef: iso(f.fechaEmision),
            RazonRef: corto(`Guías de despacho de ${mes}: folios ${guias[0].folio} al ${guias[guias.length - 1].folio} (${guias.length})`, 90),
          },
        ];

  return {
    receptorDePrueba: dePrueba,
    totales: { neto: f.neto, iva: f.iva, total: f.total },
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 33,
          Folio: 0,
          FchEmis: iso(f.fechaEmision),
        },
        Emisor: emisorDte(c),
        Receptor: {
          RUTRecep: receptor.rut,
          RznSocRecep: corto(receptor.razonSocial, 100),
          GiroRecep: corto(receptor.giro, 40),
          DirRecep: corto(receptor.direccion, 70),
          CmnaRecep: corto(receptor.comuna, 20),
        },
        Totales: { MntNeto: f.neto, TasaIVA: '19', IVA: f.iva, MntTotal: f.total },
      },
      Detalle: detalle,
      ...(referencias.length ? { Referencia: referencias } : {}),
    },
  };
}
