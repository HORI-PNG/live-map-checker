// 表記ゆれをそろえる（サーバー・ブラウザ共通）。照合と重複判定の両方で同じ関数を使う。
// 略称の対応表などは feat/favorites で足す（docs/plan.md 7章）

/** 全角半角・大文字小文字・ひらがなカタカナ・長音・空白と記号の違いをそろえる */
export function normalizeText(input: string): string {
  return (
    input
      .normalize('NFKC')
      .toLowerCase()
      // ひらがな → カタカナ
      .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
      // 長音の表記をそろえる
      .replace(/[ｰ－—―〜~]/g, 'ー')
      // 空白と記号を取り除く（文字・数字・長音だけ残す）
      .replace(/[^\p{L}\p{N}ー]/gu, '')
  )
}
