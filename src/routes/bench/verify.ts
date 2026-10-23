import { createFileRoute } from '@tanstack/react-router'
import { benchEnabled } from '@/server/bench/guard'
import { verifyFixture } from '@/server/bench/workloads'

export const Route = createFileRoute('/bench/verify')({
  server: {
    handlers: {
      GET: async () => {
        if (!benchEnabled()) return new Response('Not Found', { status: 404 })
        return Response.json(await verifyFixture('アーティスト 1', '2026-11-01'))
      },
    },
  },
})
