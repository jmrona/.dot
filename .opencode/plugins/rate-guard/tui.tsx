import { hardLimitReplyOf } from './hard-limit-reply.ts'

interface TuiContext {
  readonly data: { on(event: string, handler: (event: unknown) => void): unknown }
  readonly ui: {
    readonly router: { current(): { sessionID?: string } }
    readonly toast: { show(toast: { message: string; variant: 'info' | 'error' }): unknown }
  }
}

export default {
  id: 'rate-guard-toast',
  setup(ctx: TuiContext) {
    ctx.data.on('session.inbox.enqueued', (event) => {
      const reply = hardLimitReplyOf(event, ctx.ui.router.current().sessionID)
      if (reply !== undefined) {
        ctx.ui.toast.show(reply)
      }
    })
  },
}
