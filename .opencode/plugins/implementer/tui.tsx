/** @jsxImportSource @opentui/solid */
import { fileURLToPath } from 'node:url'
import { createEffect, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import { progressFilePath } from './progress.ts'
import type { WaveProgress } from './progress.ts'
import { collectSessionTokens, readWaveProgress, rootSessionOf } from './progress-view.ts'
import type { ProgressData } from './progress-view.ts'
import WaveBar from './wave-bar.tsx'
import WavePanel, { NO_SESSION, PANEL_NAME } from './wave-panel.tsx'
import type { StepSession } from './wave-panel.tsx'

const PROGRESS_DIRECTORY = fileURLToPath(new URL('./progress/', import.meta.url))
const REFRESH_INTERVAL_MILLISECONDS = 1000
const NO_TOKENS: ReadonlyMap<string, number> = new Map()

interface PanelSlotInput {
  readonly name: string
  readonly sessionID: string
  readonly focused: boolean
  close(): void
}

interface TuiContext {
  readonly data: ProgressData & {
    on(event: string, handler: (event: unknown) => void): unknown
    readonly session: { family(rootSessionID: string): unknown }
  }
  readonly keymap: { layer(factory: () => unknown): unknown }
  readonly ui: {
    readonly router: {
      current(): { type: string; sessionID?: string }
      navigate(route: { type: 'session'; sessionID: string }): unknown
    }
    readonly panel: {
      open(name: string): unknown
      close(): void
      current(): { name: string } | undefined
    }
    slot(slot: { append: string; render: (input: never) => unknown }): unknown
  }
}

interface LoadedProgress {
  readonly family: readonly string[]
  readonly progress: WaveProgress | undefined
  readonly tokens: ReadonlyMap<string, number>
}

function sessionIDOfEvent(event: unknown): string | undefined {
  const data = (event as { data?: { sessionID?: unknown } } | null)?.data
  return typeof data?.sessionID === 'string' ? data.sessionID : undefined
}

function agentOf(session: unknown): string | undefined {
  const agent = (session as { agent?: unknown } | null)?.agent
  return typeof agent === 'string' ? agent : undefined
}

interface ProgressStore {
  readonly progress: Accessor<WaveProgress | undefined>
  readonly tokens: Accessor<ReadonlyMap<string, number>>
  readonly now: Accessor<number>
  readonly refresh: () => Promise<void>
  readonly refreshIfPresent: () => void
  readonly isInFamily: (sessionID: string) => boolean
}

async function familyOf(ctx: TuiContext, rootSessionID: string): Promise<readonly string[]> {
  const members: unknown = await ctx.data.session.family(rootSessionID)
  return Array.isArray(members) ? members : [rootSessionID]
}

async function loadCurrent(ctx: TuiContext): Promise<LoadedProgress> {
  const route = ctx.ui.router.current()
  if (route.type !== 'session' || route.sessionID === undefined) {
    return { family: [], progress: undefined, tokens: NO_TOKENS }
  }
  const root = await rootSessionOf(ctx.data, route.sessionID)
  const loaded = await readWaveProgress(progressFilePath(PROGRESS_DIRECTORY, root))
  const loadedTokens = loaded === undefined ? NO_TOKENS : await collectSessionTokens(ctx.data, loaded)
  return { family: await familyOf(ctx, root), progress: loaded, tokens: loadedTokens }
}

async function loadCurrentOrKeepPrevious(ctx: TuiContext): Promise<LoadedProgress | undefined> {
  try {
    return await loadCurrent(ctx)
  } catch {
    return undefined
  }
}

function closePanelWithoutProgress(ctx: TuiContext, progress: WaveProgress | undefined): void {
  if (progress === undefined && ctx.ui.panel.current()?.name === PANEL_NAME) {
    ctx.ui.panel.close()
  }
}

function createProgressStore(ctx: TuiContext): ProgressStore {
  const [progress, setProgress] = createSignal<WaveProgress | undefined>(undefined)
  const [tokens, setTokens] = createSignal<ReadonlyMap<string, number>>(NO_TOKENS)
  const [now, setNow] = createSignal(Date.now())
  let family: readonly string[] = []
  let latestRefresh = 0

  async function refresh(): Promise<void> {
    const thisRefresh = ++latestRefresh
    const loaded = await loadCurrentOrKeepPrevious(ctx)
    if (loaded === undefined || thisRefresh !== latestRefresh) {
      return
    }
    family = loaded.family
    setProgress(loaded.progress)
    setTokens(loaded.tokens)
    setNow(Date.now())
    closePanelWithoutProgress(ctx, loaded.progress)
  }

  function refreshIfPresent(): void {
    if (progress() !== undefined) {
      void refresh()
    }
  }

  function isInFamily(sessionID: string): boolean {
    return family.includes(sessionID)
  }

  return { progress, tokens, now, refresh, refreshIfPresent, isInFamily }
}

function panelOpener(ctx: TuiContext): () => void {
  return function openPanel(): void {
    ctx.ui.panel.open(PANEL_NAME)
  }
}

function sessionOpener(ctx: TuiContext): (sessionID: string) => void {
  return function openSession(sessionID: string): void {
    ctx.ui.router.navigate({ type: 'session', sessionID })
  }
}

function stepSessionLoader(ctx: TuiContext): (sessionID: string) => Promise<StepSession> {
  return async function loadStepSession(sessionID: string): Promise<StepSession> {
    try {
      const messages: unknown = await ctx.data.session.message.list(sessionID)
      const session: unknown = await ctx.data.session.get(sessionID)
      return { messages: Array.isArray(messages) ? messages : [], agent: agentOf(session) }
    } catch {
      return NO_SESSION
    }
  }
}

function registerRefreshTriggers(ctx: TuiContext, store: ProgressStore): void {
  function refreshOnRouteChange(): void {
    ctx.ui.router.current()
    void store.refresh()
  }

  function refreshOnFamilyEvent(event: unknown): void {
    const sessionID = sessionIDOfEvent(event)
    if (sessionID !== undefined && store.isInFamily(sessionID)) {
      void store.refresh()
    }
  }

  createEffect(refreshOnRouteChange)
  ctx.data.on('session.step.ended', refreshOnFamilyEvent)
  ctx.data.on('session.status', refreshOnFamilyEvent)
  setInterval(store.refreshIfPresent, REFRESH_INTERVAL_MILLISECONDS)
}

function registerWaveCommand(ctx: TuiContext): void {
  const commands = [
    {
      id: 'implementer.wave',
      title: 'Show wave progress',
      description: 'Open the implement_wave progress panel',
      group: 'Session',
      palette: true,
      slash: { name: 'wave' },
      run: panelOpener(ctx),
    },
  ]

  function registerLayer(): null {
    ctx.keymap.layer(() => ({ mode: 'global', commands }))
    return null
  }

  ctx.ui.slot({ append: 'app', render: registerLayer })
}

function registerBar(ctx: TuiContext, store: ProgressStore): void {
  const onOpen = panelOpener(ctx)

  function renderBar(): unknown {
    return <WaveBar progress={store.progress()} tokens={store.tokens()} now={store.now()} onOpen={onOpen} />
  }

  ctx.ui.slot({ append: 'session.composer.top', render: renderBar })
}

function registerPanel(ctx: TuiContext, store: ProgressStore): void {
  const loadSession = stepSessionLoader(ctx)
  const onOpenSession = sessionOpener(ctx)

  function renderPanel(panel: PanelSlotInput): unknown {
    if (panel.name !== PANEL_NAME) {
      return null
    }
    function isPanelFocused(): boolean {
      return panel.focused
    }
    return (
      <WavePanel
        progress={store.progress()}
        tokens={store.tokens()}
        now={store.now()}
        isFocused={isPanelFocused}
        onClose={panel.close.bind(panel)}
        loadSession={loadSession}
        onOpenSession={onOpenSession}
      />
    )
  }

  ctx.ui.slot({ append: 'session.panel', render: renderPanel })
}

export default {
  id: 'implementer-progress',
  setup(ctx: TuiContext): void {
    const store = createProgressStore(ctx)
    registerRefreshTriggers(ctx, store)
    registerBar(ctx, store)
    registerPanel(ctx, store)
    registerWaveCommand(ctx)
  },
}
