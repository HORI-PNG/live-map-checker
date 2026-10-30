/**
 * FNV-1a を2本並べた 64 ビット相当のハッシュ（16桁の16進数）。
 * 重複判定やキャッシュの鍵に使うだけなので暗号用のハッシュは使わない（1件ずつの非同期処理で CPU 時間がかかるため）
 */
export function fnv64(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x9e3779b9
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}
