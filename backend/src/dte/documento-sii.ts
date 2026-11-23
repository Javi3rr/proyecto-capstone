import { DocumentoSii, Prisma } from '@prisma/client';
import { calcularMonto } from '../common/montos';

/**
 * Datos de emisión ante el SII tal como los entrega la API (dteEstado, dteFolio…).
 * En la base viven normalizados en la tabla documentos_sii; un documento ausente equivale a "no enviada".
 */
export interface CamposDte {
  dteEstado: DocumentoSii['estado'];
  dteFolio: number | null;
  dteAmbiente: string | null;
  dteToken: string | null;
  dteIntentos: number;
  dteError: string | null;
  dtePdfPath: string | null;
  dteXmlPath: string | null;
  dteEmitidaEn: Date | null;
  dteEmitidaPorId: number | null;
  dteAnuladaEn: Date | null;
  dteAnuladaPorId: number | null;
}

export function camposDte(doc: DocumentoSii | null | undefined): CamposDte {
  return {
    dteEstado: doc?.estado ?? 'NO_ENVIADA',
    dteFolio: doc?.folio ?? null,
    dteAmbiente: doc?.ambiente ?? null,
    dteToken: doc?.token ?? null,
    dteIntentos: doc?.intentos ?? 0,
    dteError: doc?.error ?? null,
    dtePdfPath: doc?.pdfPath ?? null,
    dteXmlPath: doc?.xmlPath ?? null,
    dteEmitidaEn: doc?.emitidoEn ?? null,
    dteEmitidaPorId: doc?.emitidoPorId ?? null,
    dteAnuladaEn: doc?.anuladoEn ?? null,
    dteAnuladaPorId: doc?.anuladoPorId ?? null,
  };
}

/** Filtro Prisma: el documento SII está emitido (con folio) */
export const DTE_EMITIDO = { documentoSii: { is: { estado: 'EMITIDA' as const } } };
/** Filtro Prisma: aún no tiene folio (sin documento, o enviado sin éxito) */
export const DTE_SIN_EMITIR = { NOT: { documentoSii: { is: { estado: 'EMITIDA' as const } } } };

/**
 * Los clientes presenciales retiran el pan en la panadería: no llevan guía de despacho electrónica, sino una
 * factura electrónica en cada retiro (decisión del cliente, 22-11-2026). El proveedor exige chofer, patente y
 * transportista en toda guía electrónica, datos que no existen para quien retira; y sin guía de despacho la
 * factura no se puede postergar a fin de mes (art. 55 de la Ley del IVA). Su guía queda como registro interno.
 */
export const GUIA_SOLO_INTERNA = { despacho: { cliente: { modalidad: 'PRESENCIAL' as const } } };
/** Filtro Prisma: la guía va al SII (no es de un cliente presencial) */
export const GUIA_VA_AL_SII = { NOT: GUIA_SOLO_INTERNA };
export const esSoloInterna = (modalidad: string) => modalidad === 'PRESENCIAL';

/** Monto de una línea de despacho: máx(kg − kg sin costo, 0) × precio del kg, redondeado a pesos */
export function montoLinea(kg: Prisma.Decimal | number, kgDescuento: Prisma.Decimal | number, precioKg: Prisma.Decimal | number): number {
  return calcularMonto(kg, kgDescuento, precioKg).toNumber();
}

/** Relaciones necesarias para entregar una guía con la forma de la API (cliente, repartidor, fecha y vuelta vienen de su despacho) */
export const INCLUDE_GUIA_COMPLETA = {
  documentoSii: true,
  despacho: {
    select: {
      vuelta: true,
      clienteId: true,
      repartidorId: true,
      jornada: { select: { fecha: true } },
      cliente: { select: { id: true, nombre: true, modalidad: true, direccion: true } },
      repartidor: { select: { id: true, nombre: true, patente: true } },
    },
  },
  facturaMensual: {
    select: { id: true, inmediata: true, estado: true, documentoSii: { select: { estado: true, folio: true, pdfPath: true, error: true } } },
  },
} satisfies Prisma.GuiaInclude;

type GuiaCompleta = Prisma.GuiaGetPayload<{ include: typeof INCLUDE_GUIA_COMPLETA }>;

/** Guía con la forma que conoce el frontend: fecha, vuelta, cliente y repartidor al nivel de la guía, y los datos SII aplanados */
export function guiaApi<T extends GuiaCompleta>(g: T) {
  const { despacho, documentoSii, facturaMensual, ...resto } = g;
  const f = facturaMensual?.inmediata ? facturaMensual : null;
  return {
    ...resto,
    /** Factura del retiro (solo clientes presenciales): se emite al imprimir la guía */
    facturaRetiro: f && {
      id: f.id,
      estado: f.estado,
      dteEstado: f.documentoSii?.estado ?? 'NO_ENVIADA',
      dteFolio: f.documentoSii?.folio ?? null,
      dteError: f.documentoSii?.error ?? null,
      conPdf: !!f.documentoSii?.pdfPath,
    },
    fecha: despacho.jornada.fecha,
    vuelta: despacho.vuelta,
    clienteId: despacho.clienteId,
    repartidorId: despacho.repartidorId,
    cliente: despacho.cliente,
    repartidor: despacho.repartidor,
    ...camposDte(documentoSii),
  };
}

/** Datos del documento SII a partir de un resultado de emisión */
export function datosEmision(r: {
  folio: number;
  ambiente: string;
  token: string | null;
  error: string | null;
  pdfPath: string | null;
  xmlPath: string | null;
  usuarioId?: number;
}) {
  return {
    estado: 'EMITIDA' as const,
    folio: r.folio,
    ambiente: r.ambiente,
    token: r.token?.slice(0, 200) ?? null,
    error: r.error ? r.error.slice(0, 1000) : null,
    pdfPath: r.pdfPath,
    xmlPath: r.xmlPath,
    emitidoEn: new Date(),
    emitidoPorId: r.usuarioId ?? null,
  };
}
