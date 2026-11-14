/** 홍길동 → 홍*동, 김수 → 김*, 남궁민수 → 남**수 */
export function maskName(name: string): string {
  const chars = [...name.trim().replace(/\s+/g, ' ')];
  if (chars.length <= 1) return chars.join('');
  if (chars.length === 2) return chars[0] + '*';
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

/** 휴대폰 번호에서 뒷 4자리만 남긴다 (화면에는 이것만 보인다). 010-1234-5678 → 5678 */
export function phoneLast4(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.slice(-4).padStart(4, '0');
}
