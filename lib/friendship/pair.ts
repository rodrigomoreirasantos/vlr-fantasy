export type CanonicalPair = { userAId: string; userBId: string };

/**
 * Par ordenado e simétrico de dois ids de usuário — `canonicalPair(a, b)` e
 * `canonicalPair(b, a)` sempre devolvem o mesmo resultado. É o que impede
 * A→B e B→A coexistirem como linhas diferentes de `friendship`, usando
 * colunas simples (sem precisar de `OR` na constraint de unicidade).
 *
 * `null` quando os dois ids são iguais — autopedido não faz sentido.
 */
export function canonicalPair(x: string, y: string): CanonicalPair | null {
  if (x === y) return null;
  return x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x };
}
