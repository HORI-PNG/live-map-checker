// 表示の切り替え「すべてのライブ／お気に入りが来るか」。選んだ表示は URL の ?mode= に持つ
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export type VenueMode = 'all' | 'fav'

const OPTIONS: { id: VenueMode; label: string }[] = [
  { id: 'all', label: 'すべてのライブ' },
  { id: 'fav', label: 'お気に入りが来るか' },
]

export function ModeToggle({ mode, className }: { mode: VenueMode; className?: string }) {
  const navigate = useNavigate()
  return (
    <fieldset className={cn('glass m-0 flex min-w-0 gap-1 rounded-segment p-1', className)}>
      <legend className="sr-only">表示の切り替え</legend>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          onClick={() =>
            navigate({
              to: '.',
              search: (prev: Record<string, unknown>) => ({
                ...prev,
                mode: option.id === 'all' ? undefined : option.id,
              }),
              replace: true,
              resetScroll: false,
            })
          }
          className={cn(
            'h-11 flex-1 cursor-pointer rounded-md border font-rounded text-sm font-bold transition-colors',
            mode === option.id
              ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft)] text-foreground'
              : 'border-transparent bg-transparent text-fg-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  )
}
