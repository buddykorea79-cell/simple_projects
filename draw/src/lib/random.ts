/** 0 이상 max 미만의 편향 없는 정수 (crypto 난수) */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) throw new Error('max must be a positive integer');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}

/** 풀에서 n명을 중복 없이 뽑는다 (부분 Fisher–Yates). 반환 순서 = 당첨 순번. */
export function pickWinners<T>(pool: readonly T[], n: number): T[] {
  if (n > pool.length) throw new Error(`당첨 인원(${n})이 대상자 수(${pool.length})보다 많아요.`);
  const a = [...pool];
  const out: T[] = [];
  for (let i = a.length - 1; i > a.length - 1 - n; i--) {
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
    out.push(a[i]);
  }
  return out;
}

/** 연출용 섞기 */
export function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
