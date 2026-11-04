import type { LineaFactura } from '../facturacion/calculo';
import { ConfigDte } from './dte.config';
import { detalleFactura, iso, receptorBloque } from './factura33';
import { ClienteReceptor, corto, emisorDte, receptorDte } from './guia52';

/** Datos necesarios para armar la nota de crédito que anula una factura mensual */
export interface NotaCreditoParaDte {
  fecha: Date;
  motivo: string;
  cliente: ClienteReceptor;
  /** Factura electrónica que se anula */
  factura: {
    folio: number;
    fechaEmision: Date;
    periodo: Date;
    lineas: LineaFactura[];
    neto: number;
    iva: number;
    total: number;
  };
}

/**
 * Arma la nota de crédito electrónica (DTE tipo 61) que anula una factura (DTE 33), en el formato SII en JSON.
 *
 *  - CodRef 1 = "anula documento de referencia": repite el detalle y los montos totales de la factura.
 *  - El receptor es el mismo cliente de la factura.
 */
export function armarNotaCredito61(n: NotaCreditoParaDte, c: ConfigDte) {
  const { receptor, dePrueba } = receptorDte(n.cliente, c, 'nota de crédito electrónica');
  const f = n.factura;
  return {
    receptorDePrueba: dePrueba,
    totales: { neto: f.neto, iva: f.iva, total: f.total },
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 61,
          Folio: 0,
          FchEmis: iso(n.fecha),
        },
        Emisor: emisorDte(c),
        Receptor: receptorBloque(receptor),
        Totales: { MntNeto: f.neto, TasaIVA: '19', IVA: f.iva, MntTotal: f.total },
      },
      Detalle: detalleFactura(f.lineas, f.periodo, c),
      Referencia: [
        {
          NroLinRef: 1,
          TpoDocRef: '33',
          FolioRef: f.folio,
          FchRef: iso(f.fechaEmision),
          CodRef: 1,
          RazonRef: corto(`ANULA FACTURA: ${n.motivo}`, 90),
        },
      ],
    },
  };
}
