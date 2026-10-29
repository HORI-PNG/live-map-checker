// スマホの各画面の見出し（「01 — 場所から探す」のような番号付きの小見出し＋大見出し＋説明）
export function MobileIntro({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 px-6 pt-7 pb-5">
      <span className="kicker">{kicker}</span>
      <h1 className="m-0 text-center text-[30px] leading-snug font-extrabold">{title}</h1>
      {children && <p className="m-0 text-sm leading-relaxed text-fg-muted">{children}</p>}
    </section>
  )
}

export function MapCard({ children }: { children: React.ReactNode }) {
  return <section className="glass mx-4 flex flex-col gap-3 rounded-panel px-3.5 pt-4 pb-3.5">{children}</section>
}
