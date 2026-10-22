import { ConfigDte } from './dte.config';

/** Resultado de emitir un DTE con un proveedor */
export interface ResultadoEmision {
  folio: number;
  token: string | null;
  /** PDF oficial con el timbre electrónico (base64), si el proveedor lo entrega */
  pdfBase64: string | null;
  /** XML firmado (base64), si el proveedor lo entrega */
  xmlBase64: string | null;
}

/** Error de emisión con un mensaje entendible para el usuario */
export class ErrorEmision extends Error {}

/**
 * Proveedor de facturación electrónica. El sistema no depende de uno en particular:
 * para cambiar de proveedor (o integrar directo con el SII) basta con otra implementación.
 */
export interface ProveedorDte {
  readonly nombre: string;
  emitir(dte: unknown, claveIdempotencia: string, siguienteFolioSimulado: () => Promise<number>): Promise<ResultadoEmision>;
}

/** Modo simulado: no se conecta a nada; asigna folios de prueba correlativos */
export class ProveedorSimulado implements ProveedorDte {
  readonly nombre = 'SIMULADO';

  async emitir(_dte: unknown, _clave: string, siguienteFolio: () => Promise<number>): Promise<ResultadoEmision> {
    return { folio: await siguienteFolio(), token: null, pdfBase64: null, xmlBase64: null };
  }
}

/**
 * OpenFactura (Haulmer): proveedor certificado ante el SII con API REST.
 *   POST {url}/v2/dte/document   cabecera "apikey"
 * En el ambiente de desarrollo usa un CAF simulado: no tiene efecto tributario.
 */
export class ProveedorOpenFactura implements ProveedorDte {
  readonly nombre: string;

  constructor(private readonly c: ConfigDte) {
    this.nombre = c.modo === 'produccion' ? 'PRODUCCION' : 'PRUEBAS';
  }

  async emitir(dte: unknown, claveIdempotencia: string): Promise<ResultadoEmision> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.c.apiUrl.replace(/\/$/, '')}/v2/dte/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.c.apiKey,
          'Idempotency-Key': claveIdempotencia,
        },
        body: JSON.stringify({ response: ['FOLIO', 'PDF', 'XML'], dte }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErrorEmision(
        `No se pudo conectar con el proveedor de facturación (${e instanceof Error ? e.message : 'sin respuesta'}). Revise la conexión a internet.`,
      );
    }

    const texto = await respuesta.text();
    let cuerpo: Record<string, unknown> = {};
    try {
      cuerpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      // respuesta no JSON: se informa el texto tal cual
    }

    if (!respuesta.ok) {
      if (respuesta.status === 401) throw new ErrorEmision('El proveedor rechazó la llave (DTE_API_KEY inválida).');
      if (respuesta.status === 429) throw new ErrorEmision('Demasiadas emisiones seguidas; espere unos segundos y reintente.');
      throw new ErrorEmision(`Rechazada por el proveedor (HTTP ${respuesta.status}): ${mensajeDe(cuerpo, texto)}`);
    }

    const folio = Number(cuerpo.FOLIO ?? cuerpo.folio);
    if (!Number.isInteger(folio) || folio <= 0) {
      throw new ErrorEmision(`El proveedor no devolvió un folio: ${mensajeDe(cuerpo, texto)}`);
    }
    const s = (k: string) => {
      const v = cuerpo[k] ?? cuerpo[k.toLowerCase()];
      return typeof v === 'string' && v ? v : null;
    };
    return { folio, token: s('TOKEN'), pdfBase64: s('PDF'), xmlBase64: s('XML') };
  }
}

/** Extrae el mensaje de error de la respuesta del proveedor, sea cual sea su forma */
function mensajeDe(cuerpo: Record<string, unknown>, texto: string): string {
  const error = cuerpo.error as Record<string, unknown> | string | undefined;
  const partes: string[] = [];
  if (typeof error === 'string') partes.push(error);
  else if (error && typeof error === 'object') {
    if (error.message) partes.push(String(error.message));
    if (error.details) partes.push(typeof error.details === 'string' ? error.details : JSON.stringify(error.details));
  }
  if (cuerpo.message) partes.push(String(cuerpo.message));
  const m = partes.join(' · ') || texto || 'sin detalle';
  return m.length > 800 ? m.slice(0, 800) + '…' : m;
}
