/**
 * Descarga una tabla como CSV que Excel (configuración es-CL) abre directamente:
 * separador ";" y BOM UTF-8 para que respete tildes y ñ.
 */
export function descargarCsv(nombreArchivo: string, filas: (string | number | null | undefined)[][]): void {
  const celda = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    // Números con coma decimal, como los muestra Excel en español
    const texto = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const contenido = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
