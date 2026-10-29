// 画面上部のガラス風ヘッダー。戻るボタンとパンくずリストのみ（要件定義書 8章）
// - back なし: アプリ名を出す（スマホのみ。PC は左ナビにロゴがあるので出さない）
// - back あり: 戻るボタン＋パンくず（スマホ・PC 共通）。長いときは末尾を「…」で省略
import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import { ChevronLeftIcon, PinIcon } from '@/components/nav/icons'

export type Crumb = { label: string; to?: string }

type Props = { back?: { to: string; label: string }; crumbs?: Crumb[] }

export function PageHeader({ back, crumbs = [] }: Props) {
  if (!back) {
    return (
      <header className="glass-raised mx-4 mt-4 flex h-14 shrink-0 items-center gap-2 rounded-header px-[18px] lg:hidden">
        <PinIcon />
        <span className="font-rounded text-base font-extrabold">Live Map Checker</span>
      </header>
    )
  }
  return (
    <header className="glass-raised mx-4 mt-4 flex h-14 shrink-0 items-center gap-2 rounded-header px-1.5 lg:mx-0 lg:mt-0 lg:gap-2.5 lg:px-2">
      <Link
        to={back.to}
        aria-label={back.label}
        className="flex size-11 shrink-0 items-center justify-center rounded-button border border-[var(--glass-border-strong)] bg-[var(--glass-strong)] text-foreground hover:text-foreground lg:size-10"
      >
        <ChevronLeftIcon />
      </Link>
      <nav aria-label="現在地" className="min-w-0 flex-1">
        <ol className="m-0 flex min-w-0 list-none items-center p-0 text-[13px] text-fg-muted lg:text-sm">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1
            return (
              <Fragment key={`${crumb.to ?? ''}:${crumb.label}`}>
                {i > 0 && (
                  <li aria-hidden="true" className="shrink-0 px-1">
                    /
                  </li>
                )}
                <li className={last ? 'min-w-0 truncate' : 'shrink-0'}>
                  {last ? (
                    <strong aria-current="page" className="font-bold text-foreground">
                      {crumb.label}
                    </strong>
                  ) : crumb.to ? (
                    <Link to={crumb.to} className="text-fg-muted no-underline hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    crumb.label
                  )}
                </li>
              </Fragment>
            )
          })}
        </ol>
      </nav>
    </header>
  )
}
