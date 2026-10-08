/** Código escaneado o escrito: solo dígitos y sin ceros a la izquierda (Excel suele borrarlos) */
export function normalizarCodigo(codigo: string | null | undefined): string {
  return String(codigo ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Busca productos por código de barras o, si no hay coincidencia, por PLU exacto.
 * Varios productos pueden compartir un código de barras (por eso devuelve una lista).
 */
export function buscarPorCodigo<T extends { plu: string; codigoBarras?: string | null }>(productos: T[], texto: string): T[] {
  const limpio = texto.trim();
  if (!limpio) return [];
  const codigo = normalizarCodigo(limpio);
  if (codigo.length >= 6) {
    const porBarras = productos.filter((p) => p.codigoBarras && normalizarCodigo(p.codigoBarras) === codigo);
    if (porBarras.length) return porBarras;
  }
  return productos.filter((p) => p.plu.toUpperCase() === limpio.toUpperCase());
}

/** true si el texto de búsqueda coincide con el código de barras del producto */
export function coincideBarras(codigoBarras: string | null | undefined, texto: string): boolean {
  const c = normalizarCodigo(texto);
  return c.length >= 6 && !!codigoBarras && normalizarCodigo(codigoBarras) === c;
}
