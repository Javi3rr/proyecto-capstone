/**
 * Lectura y escritura de planillas (Excel .xlsx/.xls y CSV) en el navegador.
 * La librería se carga solo cuando se usa (no aumenta la carga inicial de la aplicación).
 */

export type Celda = string | number | null;

export interface Planilla {
  hojas: string[];
  hoja: string;
  filas: Celda[][];
}

const MAX_MB = 15;

function fechaISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Lee la hoja indicada (o la primera) como una grilla de celdas. Las fechas quedan como "AAAA-MM-DD". */
export async function leerPlanilla(archivo: File, hoja?: string): Promise<Planilla> {
  if (archivo.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo pesa más de ${MAX_MB} MB.`);
  const XLSX = await import('xlsx');
  const datos = await archivo.arrayBuffer();
  const libro = XLSX.read(datos, { type: 'array', cellDates: true, codepage: 65001 });
  if (libro.SheetNames.length === 0) throw new Error('El archivo no tiene hojas.');
  const nombre = hoja && libro.SheetNames.includes(hoja) ? hoja : libro.SheetNames[0];
  const crudas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: false });
  const filas = crudas.map((fila) =>
    fila.map((v): Celda => {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return fechaISO(v);
      if (typeof v === 'number') return v;
      const t = String(v).trim();
      return t === '' ? null : t;
    }),
  );
  return { hojas: libro.SheetNames, hoja: nombre, filas };
}

/** Descarga una planilla .xlsx */
export async function descargarExcel(nombreArchivo: string, hoja: string, filas: Celda[][]): Promise<void> {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), hoja.slice(0, 31));
  XLSX.writeFile(libro, nombreArchivo);
}

/**
 * Convierte el texto de una celda a número, aceptando formatos chilenos:
 * "$ 2.000" -> 2000, "1.234,5" -> 1234.5, "2,5" -> 2.5, "0.250" (kg) -> 0.25.
 */
export function aNumero(v: Celda): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = v.replace(/[$\s]/g, '').replace(/[^\d.,-]/g, '');
  if (!t || t === '-' ) return null;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    // El último separador es el decimal
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma >= 0) {
    t = t.replace(',', '.');
  } else if (punto >= 0 && /^\-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // "2.000" o "12.500.000": puntos de miles
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function aTexto(v: Celda): string | null {
  if (v === null) return null;
  const t = typeof v === 'number' ? String(v) : v.trim();
  return t === '' ? null : t;
}

/** Fila de títulos probable: la primera con al menos 2 celdas de texto (no números) */
export function detectarFilaTitulos(filas: Celda[][]): number {
  const limite = Math.min(filas.length, 15);
  for (let i = 0; i < limite; i++) {
    const textos = filas[i].filter((c) => typeof c === 'string' && !/^\d+([.,]\d+)?$/.test(c)).length;
    if (textos >= 2) return i;
  }
  return 0;
}

export interface CampoMapeo {
  clave: string;
  etiqueta: string;
  requerido?: boolean;
  ayuda?: string;
  /** Palabras con que suele venir el título de la columna */
  sinonimos: string[];
}

export type Mapeo = Record<string, number | null>;

function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Propone qué columna corresponde a cada campo según el título */
export function adivinarMapeo(titulos: Celda[], campos: CampoMapeo[]): Mapeo {
  const normales = titulos.map((t) => normalizar(String(t ?? '')));
  const usadas = new Set<number>();
  const mapeo: Mapeo = {};
  for (const campo of campos) {
    let elegido: number | null = null;
    // Primero coincidencia exacta, luego "contiene"
    for (const exacta of [true, false]) {
      for (const s of campo.sinonimos.map(normalizar)) {
        const i = normales.findIndex((n, idx) => !usadas.has(idx) && n !== '' && (exacta ? n === s : n.includes(s)));
        if (i >= 0) {
          elegido = i;
          break;
        }
      }
      if (elegido !== null) break;
    }
    if (elegido !== null) usadas.add(elegido);
    mapeo[campo.clave] = elegido;
  }
  return mapeo;
}

/** Letra de columna de Excel: 0 -> A, 27 -> AB */
export function letraColumna(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
