/** @jsxImportSource @opentui/solid */
import { fileURLToPath } from 'node:url'
import { createEffect, createSignal } from 'solid-js'
import { commandReplyOf, readIndicatorState, type IndicatorData } from './indicator.ts'

const CONFIG_PATH = fileURLToPath(new URL('./config.json', import.meta.url))

interface TuiContext {
  readonly data: IndicatorData & { on(event: string, handler: (event: unknown) => void): unknown }
  readonly ui: {
    readonly router: { current(): { sessionID?: string } }
    readonly toast: { show(toast: { message: string; variant: 'info' | 'error' }): unknown }
    slot(slot: { append: string; render: () => unknown }): unknown
  }
}

export default {
  id: 'auto-compact-indicator',
  setup(ctx: TuiContext) {
    const [label, setLabel] = createSignal<string | undefined>(undefined)
    let latestRefresh = 0

    async function refresh(sessionID: string | undefined): Promise<void> {
      const thisRefresh = ++latestRefresh
      const next = await readIndicatorState(ctx.data, sessionID, CONFIG_PATH)
      if (thisRefresh === latestRefresh) {
        setLabel(next)
      }
    }

    createEffect(() => {
      void refresh(ctx.ui.router.current().sessionID)
    })
    const refreshCurrent = () => void refresh(ctx.ui.router.current().sessionID)
    ctx.data.on('session.step.ended', refreshCurrent)
    ctx.data.on('session.inbox.enqueued', (event) => {
      refreshCurrent()
      const reply = commandReplyOf(event, ctx.ui.router.current().sessionID)
      if (reply !== undefined) {
        ctx.ui.toast.show(reply)
      }
    })

    ctx.ui.slot({
      append: 'prompt.footer.status',
      render: () => (label() === undefined ? null : <text>{label()}</text>),
    })
  },
}
