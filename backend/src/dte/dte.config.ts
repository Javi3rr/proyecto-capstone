/**
 * Configuración de la guía de despacho electrónica (variables de entorno, ver .env.example).
 *
 *  DTE_MODO = simulado   → no se conecta a nada; asigna folios de prueba (para clases y demos sin internet)
 *           = pruebas    → ambiente de desarrollo del proveedor (CAF simulado, sin efecto tributario)
 *           = produccion → emisión real ante el SII (requiere certificado digital, folios y contrato con el proveedor)
 */
export type ModoDte = 'simulado' | 'pruebas' | 'produccion';

export interface EmisorDte {
  rut: string;
  razonSocial: string;
  giro: string;
  acteco: number;
  direccion: string;
  comuna: string;
  /** Código de sucursal SII (opcional) */
  sucursal: string | null;
}

export interface ConfigDte {
  modo: ModoDte;
  apiUrl: string;
  apiKey: string;
  emisor: EmisorDte;
  /** true = el precio del kg incluye IVA (se desglosa el neto para la guía) */
  preciosConIva: boolean;
  /** Receptor de prueba para clientes sin RUT (solo fuera de producción) */
  receptorPrueba: { rut: string; razonSocial: string; giro: string; comuna: string; direccion: string };
}

/** Datos públicos de prueba de OpenFactura (Haulmer) para su ambiente de desarrollo */
const PRUEBAS = {
  apiUrl: 'https://dev-api.haulmer.com',
  apiKey: '928e15a2d14d4a6292345f04960f4bd3',
  emisor: {
    rut: '76795561-8',
    razonSocial: 'HAULMER SPA',
    giro: 'VENTA AL POR MENOR EN EMPRESAS DE VENTA A DISTANCIA VIA INTERNET',
    acteco: 479100,
    direccion: 'ARTURO PRAT 527 CURICO',
    comuna: 'Curicó',
    sucursal: '81303347',
  },
  receptor: { rut: '76430498-5', razonSocial: 'HOSTY SPA', giro: 'SERVICIOS', comuna: 'Curicó', direccion: 'ARTURO PRAT 527' },
};

const env = (k: string) => process.env[k]?.trim() || undefined;

export function leerConfigDte(): ConfigDte {
  const modoEnv = (env('DTE_MODO') ?? 'simulado').toLowerCase();
  const modo: ModoDte = modoEnv === 'pruebas' || modoEnv === 'produccion' ? modoEnv : 'simulado';
  const enProduccion = modo === 'produccion';
  const base = enProduccion ? null : PRUEBAS;
  return {
    modo,
    apiUrl: env('DTE_API_URL') ?? (enProduccion ? 'https://api.haulmer.com' : PRUEBAS.apiUrl),
    apiKey: env('DTE_API_KEY') ?? (base?.apiKey ?? ''),
    emisor: {
      rut: env('DTE_EMISOR_RUT') ?? base?.emisor.rut ?? '',
      razonSocial: env('DTE_EMISOR_RAZON_SOCIAL') ?? base?.emisor.razonSocial ?? '',
      giro: env('DTE_EMISOR_GIRO') ?? base?.emisor.giro ?? '',
      acteco: Number(env('DTE_EMISOR_ACTECO') ?? base?.emisor.acteco ?? 0),
      direccion: env('DTE_EMISOR_DIRECCION') ?? base?.emisor.direccion ?? '',
      comuna: env('DTE_EMISOR_COMUNA') ?? base?.emisor.comuna ?? '',
      sucursal: env('DTE_EMISOR_SUCURSAL') ?? base?.emisor.sucursal ?? null,
    },
    preciosConIva: (env('DTE_PRECIOS_CON_IVA') ?? 'true').toLowerCase() !== 'false',
    receptorPrueba: PRUEBAS.receptor,
  };
}

/** Problemas de configuración que impiden emitir (vacío = listo) */
export function problemasConfig(c: ConfigDte): string[] {
  if (c.modo === 'simulado') return [];
  const p: string[] = [];
  if (!c.apiKey) p.push('Falta DTE_API_KEY (llave del proveedor de facturación).');
  if (!c.emisor.rut) p.push('Falta DTE_EMISOR_RUT (RUT de la panadería).');
  if (!c.emisor.razonSocial) p.push('Falta DTE_EMISOR_RAZON_SOCIAL.');
  if (!c.emisor.giro) p.push('Falta DTE_EMISOR_GIRO.');
  if (!c.emisor.acteco) p.push('Falta DTE_EMISOR_ACTECO (código de actividad económica del SII).');
  if (!c.emisor.direccion || !c.emisor.comuna) p.push('Falta la dirección o comuna del emisor (DTE_EMISOR_DIRECCION / DTE_EMISOR_COMUNA).');
  return p;
}
