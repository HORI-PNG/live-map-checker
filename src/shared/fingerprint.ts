import { fnv64 } from './hash'
import { normalizeText } from './normalize'

/** 公演の重複を防ぐ鍵: 会場・日付・開演時刻・正規化したタイトルのハッシュ（取得と AI 検索で共通） */
export function fingerprintOf(venueId: number, date: string, startTime: string | null, title: string): string {
  // 開演時刻も含める（同じ日に同じタイトルの昼の部・夜の部があるため）
  return fnv64(`${venueId}|${date}|${startTime ?? ''}|${normalizeText(title)}`)
}
