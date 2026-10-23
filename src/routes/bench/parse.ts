import { createFileRoute } from '@tanstack/react-router'
import { benchEnabled } from '@/server/bench/guard'
import { parseZeppFixture } from '@/server/bench/workloads'

export const Route = createFileRoute('/bench/parse')({
  server: {
    handlers: {
      GET: async () => {
        if (!benchEnabled()) return new Response('Not Found', { status: 404 })
        const events = await parseZeppFixture()
        return Response.json({ count: events.length, first: events[0] })
      },
    },
  },
})
