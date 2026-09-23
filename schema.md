# @onetype/stack-app-kit

## Functions

> Orders the plugins given and boots each one.
### boot(log: HostLog, plugins: readonly HostPlugin[]): BootedKernel

> Turns a query client into the cache the kernel hands plugins.
### cachePlugin(client: Queries): HostPlugin

> Builds a kernel from what the application declared.
### createKernel(options: KernelOptions): Kernel

> Reads what the given plugins declare; a name narrows it to that one.
### declarationsOf(plugins: readonly Plugin[], name?: string): Declaration[]

> Declares a plugin.
### definePlugin<Schema extends z.ZodType, Services = unknown>(name: string, definition: Definition<Schema, Services>): Plugin

> The plugins a bundler found, sorted by name.
### discover(modules: PluginModules): Plugin[]

> Configuration rules, refused by name rather than repaired.
> A bundler replaces `import.meta.env.NAME` where it is written, so reading
> belongs to the application: it reads the value and passes it to a rule.
> What counts as legal is then the same everywhere.
### Env: { rules: { text: (name: string, given: unknown, fallback?: string) => string | undefined; required: (name: string, given: unknown) => string; number: (name: string, given: unknown, fallback: number, min?: number, max?: number) => number; flag: (name: string, given: unknown, fallback: boolean) => boolean; list: (given: unknown) => readonly string[]; oneOf: <Allowed extends string>(name: string, given: unknown, allowed: readonly Allowed[], fallback: Allowed) => Allowed } }
    rules: {
    text: (name: string, given: unknown, fallback?: string) => string | undefined
    required: (name: string, given: unknown) => string
    number: (name: string, given: unknown, fallback: number, min?: number, max?: number) => number
    flag: (name: string, given: unknown, fallback: boolean) => boolean
    list: (given: unknown) => readonly string[]
    oneOf: <Allowed extends string>(name: string, given: unknown, allowed: readonly Allowed[], fallback: Allowed) => Allowed
    }

> The kernel plugin: what lets an application declare plugins of its own.
### kernelPlugin(): HostPlugin

> Offers the leveled logger and the shipper that sends a browser's logs home.
### logsPlugin(): HostPlugin

> Brings an application up in one call.
### mountPlugin(): HostPlugin

> Turns the routes plugins declared into a router the application renders.
### routerPlugin(building: RouterOptions): HostPlugin

> Offers what writes a site's sitemap and robots.txt.
### seoPlugin(): HostPlugin

> Names the entry that renders pages in Node: prerender at build time, and per request.
### serverPlugin(): HostPlugin

> Where an application listens, and which server `/api` reaches.
> `strictPort` is the point: a port already taken is refused rather than
> quietly moved to, so two people running their own never share one by
> accident and wonder whose change they are looking at.
### serving(options?: ServingOptions): Serving

> Offers what maps the environment onto plugin config, and what refuses a public secret.
### settingsPlugin(): HostPlugin

> Brings an application up: transport, then kernel, then plugins.
### start(given: StartOptions): Promise<StartedApp>

> The transport plugin.
### transportPlugin(settings: TransportOptions): HostPlugin

## Classes

> One run of the kernel: the plugins it booted, and the host they share.
### BootedKernel
    #private
    constructor(host: Host, plugins: readonly HostPlugin[])
    get host(): Host
    get order(): string[]
    start(): Promise<void>
    stop(): Promise<void>

> A refusal from the kernel itself, naming the plugin it came from.
### BootFault extends Error
    readonly code: BootFaultCode
    readonly plugin: string | undefined
    constructor(code: BootFaultCode, message: string, plugin?: string, cause?: unknown)
    toString(): string

> What every plugin receives: the wiring, and nothing about any particular plugin.
### Host
    #private
    constructor(log: HostLog, shared?: Wiring, who?: string)
    get who(): string
    as(who: string): Host
    enter(phase: Phase): void
    log(line: string, about?: Readonly<Record<string, unknown>>): void
    offer(name: string, api: unknown): void
    take<Api>(name: string): Api | undefined
    offers(): string[]
    on(name: string, run: (payload: unknown) => void): void
    emit(name: string, payload: unknown): void
    listenerCount(name: string): number

> A refusal, naming the plugin it came from.
### KernelFault extends Error
    readonly code: KernelFaultCode
    readonly plugin: string | undefined
    readonly detail: Readonly<Record<string, unknown>>
    constructor(code: KernelFaultCode, message: string, about?: KernelFaultDetail)
    toString(): string

## Types

> What the kernel refuses, and why.
### BootFaultCode = "NO_NAME" | "NO_BOOT" | "REGISTERED_TWICE" | "UNKNOWN_NEED" | "CYCLE" | "NOT_BOOTING" | "OFFERED_TWICE" | "NO_API"

> What the kernel needs to drop what a view is holding.
### Cache
    invalidate: (key: readonly unknown[]) => void
    // Cancels what is still loading, drops every entry no view shows, and resets the ones a view shows so they fetch again: when the data's owner changed (a workspace switch, sign-out), not when some of it went stale.
    clear: () => void
    // Fetches `key` into the cache before a page renders, so the page reads it without a request and a server's state carries it.
    prefetch: (key: readonly unknown[], fetch: () => Promise<unknown>) => Promise<void>

> One request, as a plugin makes it.
### CallOptions
    query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined
    body?: unknown
    headers?: Readonly<Record<string, string>> | undefined
    signal?: AbortSignal | undefined

> Something a plugin can be asked to do, behind the permissions it names.
### Command<Context> = DescribableWithSchema &
    // What the viewer must hold. This decides what renders, never what is allowed: the browser holds these strings, so the server must refuse the same request independently.
    requires?: readonly string[] | undefined
    run: (input: unknown, ctx: Context) => void | Promise<void>

> What every plugin function receives.
### Context<Config = unknown, Services = unknown> =
    name: string
    config: Config
    services: Services
    log: Logger
    http: HttpClient
    cache: Cache
    realtime: Realtime
    events: {
    emit: (event: string, payload: unknown) => void
    // Hears an event for as long as the caller wants, and answers what stops it.
    on: (event: string, handle: (payload: unknown) => void) => () => void
    }
    hooks: {
    // Runs a hook and answers the first refusal, or undefined.
    run: (hook: string, payload: unknown) => Promise<string | undefined>
    }
    permissions: {
    has: (permission: string) => boolean
    all: (permissions: readonly string[]) => boolean
    // Says the answer moved, so every guard asks again: permissions are the one declaration that is not static.
    changed: () => void
    // Runs `notify` whenever `changed` is called. Returns a stop.
    watch: (notify: () => void) => () => void
    }
    commands: {
    run: (command: string, input: unknown) => Promise<void>
    }
    session: {
    // Says who is looking, or at what, changed (sign-in, sign-out, a workspace switch), in the order that leaves nothing
    // stale: the cache clears (when the one given can), every guard asks again, and the socket dials the address as it reads now.
    changed: () => void
    }
    // Another plugin's services, by name. Reachable outside a component.
    use: <Api>(plugin: string) => Api

> One thing wrong, and everything needed to fix it.
### ContractProblem
    code: KernelFault["code"]
    plugin: string
    message: string

> Everything one plugin declares, as data rather than source.
### Declaration
    readonly name: string
    readonly version: string
    readonly describe: string
    readonly dependsOn: readonly string[]
    readonly routes: readonly DeclaredRoute[]
    readonly permissions: readonly DeclaredEntry[]
    readonly slots: readonly DeclaredEntry[]
    readonly contributes: readonly DeclaredContribution[]
    readonly emits: readonly DeclaredEntry[]
    readonly listens: readonly DeclaredEntry[]
    readonly hooks: readonly DeclaredEntry[]
    readonly participates: readonly DeclaredEntry[]
    readonly commands: readonly DeclaredCommand[]
    readonly frame: boolean
    readonly pages: boolean
    readonly fallback: boolean
    readonly grants: boolean
    readonly config: boolean
    readonly services: boolean
    readonly setup: boolean
    readonly teardown: boolean

> One command, which unlike an event names what the caller must hold.
### DeclaredCommand = DeclaredEntry &
    readonly requires: readonly string[]

> One contribution: the slot it fills, and what it takes to be shown.
### DeclaredContribution
    readonly slot: string
    readonly order?: number
    readonly requires: readonly string[]

> A name carrying a sentence, which is how events, hooks, slots and permissions read.
### DeclaredEntry
    readonly name: string
    readonly describe: string

> One page as declared: where it lives, and what it takes to see it.
### DeclaredRoute
    readonly path: string
    readonly title: string
    readonly requires: readonly string[]
    // Whether it redirects the viewer elsewhere before `requires` is asked.
    readonly instead: boolean

> Everything a plugin declares about itself.
### Definition<Schema extends z.ZodType = z.ZodType, Services = unknown> = Describable &
    version: string
    dependsOn?: readonly string[] | undefined
    config?: Schema | undefined
    permissions?: Readonly<Record<string, Permission>> | undefined
    // What the viewer may do, read on every check. At most one plugin offers this.
    // Declaring it REPLACES the `permissions` passed to createKernel entirely:
    // that source is never read again, and is not merged in. The plugin holding
    // the session answers alone, so a sign-out takes every permission with it.
    grants?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => readonly string[]) | undefined
    // The closed set `grants` answers from, so a route or contribution requiring a permission outside it is refused at startup rather than never rendering.
    // Left out, `grants` may answer anything any plugin declares. Named after OIDC's `scopes_supported`, which it is.
    grantsSupported?: readonly string[] | undefined
    services?: ((ctx: Context<z.infer<Schema>, never>) => Services) | undefined
    fallback?: ComponentType<FallbackProps> | undefined
    // The frame every page renders inside. At most one plugin offers this.
    // The shell every page renders inside; it is handed the page as its children.
    frame?: FunctionComponent<{
    children?: ReactNode
    }> | undefined
    // What shows instead of a page: 403 when a permission is missing, 404 when nothing declared the path.
    pages?: Pages | undefined
    routes?: readonly Route<z.infer<Schema>, Given<Services>>[] | undefined
    slots?: Readonly<Record<string, Slot>> | undefined
    contributes?: readonly SlotContribution[] | undefined
    emits?: Readonly<Record<string, Event>> | undefined
    listens?: Readonly<Record<string, Listener<Context<z.infer<Schema>, Given<Services>>>>> | undefined
    hooks?: Readonly<Record<string, Hook>> | undefined
    participates?: Readonly<Record<string, Participant<Context<z.infer<Schema>, Given<Services>>>>> | undefined
    commands?: Readonly<Record<string, Command<Context<z.infer<Schema>, Given<Services>>>>> | undefined
    // What this plugin adds to the headers of every request the kit makes: asked per request, never sent outside `baseUrl`.
    sends?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => Readonly<Record<string, string>>) | undefined
    setup?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>) | undefined
    teardown?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>) | undefined

> Anything declared carries a sentence saying what it is for.
### Describable
    describe: string

> A declaration whose payload is checked before it reaches anyone.
### DescribableWithSchema = Describable &
    schema: z.ZodType

> An event a plugin publishes.
### Event
    describe: string
    schema: z.ZodType

> What a component sees when a contribution or a page threw.
### FallbackProps
    error: unknown
    plugin: string
    reset: () => void

> What the frame around every page needs.
### Frame
    shell: ComponentType
    missing: ComponentType
    // What renders at `/` when no plugin declares it: a redirect to the first route there is.
    landing: (to: string) => ComponentType

> What a page says about itself to a search engine and a link preview. Every field is optional; `title` falls back to the route's.
### Head = z.input<typeof headSchema>

> One element of `<head>`, as data: rendered to a string on a server, created as a node in a browser.
### HeadTag = { tag: "title"; text: string } | { tag: "meta"; attributes: Readonly<Record<string, string>> } | { tag: "link"; attributes: Readonly<Record<string, string>> } | { tag: "script"; attributes: Readonly<Record<string, string>>; text: string }

> A point where a plugin may refuse what is about to happen.
### Hook
    describe: string
    schema: z.ZodType

> Where a line goes. The application decides; a plugin never writes directly.
### HostLog = (line: string, about?: Readonly<Record<string, unknown>>) => void

> What one of our plugins declares about itself.
### HostPlugin
    // The folder, the module and the key other plugins take it by.
    name: string
    // Plugin names whose api this one calls. Boot order follows.
    needs?: readonly string[]
    // Wiring: read config, offer an api, subscribe, claim a hook point.
    boot: (host: Host) => void
    // Where work begins, in boot order. Optional.
    start?: (host: Host) => void | Promise<void>
    // Unwinds it, in reverse. Optional.
    stop?: (host: Host) => void | Promise<void>

> What the kernel needs to reach a server: every method answers the bare body, a 2xx parsed, a 204 `undefined`, anything else thrown.
### HttpClient
    get: (path: string, request?: CallOptions) => Promise<unknown>
    post: (path: string, request?: CallOptions) => Promise<unknown>
    put: (path: string, request?: CallOptions) => Promise<unknown>
    patch: (path: string, request?: CallOptions) => Promise<unknown>
    delete: (path: string, request?: CallOptions) => Promise<unknown>

> What the application holds after createKernel.
### Kernel
    start: () => Promise<void>
    stop: () => Promise<void>
    started: () => boolean
    routes: () => readonly RegisteredRoute[]
    // The plugins this kernel started, for a caller reading what they declare.
    plugins: () => readonly Plugin[]
    frame: () => FunctionComponent<{
    children?: ReactNode
    }> | undefined
    pages: () => Pages
    slot: (name: string, payload: unknown) => {
    contributions: readonly MountedContribution[]
    payload: unknown
    problem?: string
    }
    hasSlot: (name: string) => boolean
    fallbackFor: (plugin: string) => ComponentType<FallbackProps> | undefined
    context: (plugin: string) => Context
    permissions: {
    has: (permission: string) => boolean
    all: (permissions: readonly string[]) => boolean
    changed: () => void
    watch: (notify: () => void) => () => void
    }
    events: {
    failures: () => readonly ListenerFailure[]
    }
    run: (command: string, input: unknown) => Promise<void>
    sent: () => Readonly<Record<string, string>>

> What the kernel refuses.
### KernelFaultCode
    | "DUPLICATE_PLUGIN"
    | "UNKNOWN_DEPENDENCY"
    | "DEPENDENCY_CYCLE"
    | "INVALID_NAME"
    | "INVALID_CONFIG"
    | "INVALID_ROUTE"
    | "INVALID_PAYLOAD"
    | "UNDECLARED_EVENT"
    | "UNDECLARED_HOOK"
    | "UNDECLARED_SLOT"
    | "UNDECLARED_COMMAND"
    | "UNDECLARED_PERMISSION"
    | "UNDECLARED_DEPENDENCY"
    | "DUPLICATE_ROUTE"
    | "DUPLICATE_SLOT"
    | "DUPLICATE_EVENT"
    | "DUPLICATE_HOOK"
    | "DUPLICATE_COMMAND"
    | "DUPLICATE_PERMISSION"
    | "DUPLICATE_GRANTS"
    | "UNNOMINATED_GRANTS"
    | "UNGRANTABLE_PERMISSION"
    | "DUPLICATE_HEADER"
    | "DUPLICATE_FRAME"
    | "DUPLICATE_PAGE"
    | "PERMISSION_DENIED"
    | "NOT_STARTED"

> What an application gives the kernel.
### KernelOptions
    plugins: readonly Plugin[]
    config?: Readonly<Record<string, unknown>>
    http?: HttpClient
    // Without `clear`, ctx.cache.clear() refuses, naming what to give.
    cache?: Omit<Cache, "clear" | "prefetch"> & Partial<Pick<Cache, "clear" | "prefetch">>
    // Without `reconnect`, the kernel answers one that does nothing.
    realtime?: Omit<Realtime, "reconnect"> & Partial<Pick<Realtime, "reconnect">>
    permissions?: PermissionSource
    // Which plugin may answer what the viewer holds; any other declaring `grants` is refused. Left out, the one plugin declaring `grants` is that plugin, and may own permissions under its own name.
    grantedBy?: string
    log?: LogFn

### Listener
    who: string
    run: (payload: unknown) => void

> What a listener does when an event arrives: `payload` is `unknown`, never `never`, because contravariance lets a `never` annotation endorse a wrong schema.
### Listener<Context> = Describable &
    handle: (payload: unknown, ctx: Context) => void | Promise<void>

> A delivery that threw, kept so an application can see it happened.
### ListenerFailure
    event: string
    plugin: string
    error: unknown
    atMs: number

> Where a line goes. The application decides; a plugin never writes directly.
### LogFn = (level: "debug" | "info" | "warn" | "error", plugin: string, line: string, about?: Readonly<Record<string, unknown>>) => void

> Where a plugin's lines go. The application decides.
### Logger
    debug: (line: string, about?: Readonly<Record<string, unknown>>) => void
    info: (line: string, about?: Readonly<Record<string, unknown>>) => void
    warn: (line: string, about?: Readonly<Record<string, unknown>>) => void
    error: (line: string, about?: Readonly<Record<string, unknown>>) => void

> One thing to render in a slot, and what it needs to be seen.
### MountedContribution = SlotContribution &
    plugin: string

> What shows when a viewer may not see a page, or nothing declared it.
### Pages
    forbidden?: FunctionComponent<{
    permission?: string | undefined
    }>
    missing?: FunctionComponent | undefined

> What a participant answers: nothing to allow, a reason to refuse.
### Participant<Context> = Describable &
    handle: (payload: unknown, ctx: Context) => string | undefined | Promise<string | undefined>

> What a plugin may do, named so an application can grant it.
### Permission
    describe: string

> Where the viewer's permissions come from. The application owns this.
### PermissionSource
    granted: () => readonly string[]

> A plugin: its name, and what it declared.
### Plugin
    name: string
    definition: Definition

> What a bundler's eager glob returns.
### PluginModules = Readonly<Record<string,
    default?: Plugin

> What the kernel needs to hear a server push.
### Realtime
    channel: () => "ws" | "http"
    // `refused` hears the server decline the channel; unknown and forbidden read alike, so nobody can probe which exist.
    subscribe: (topic: string, receive: (message: unknown) => void, refused?: (code: string) => void) => {
    close: () => void
    }
    // Dials the socket again with the address as it reads now, keeping every subscription: after sign-in, sign-out or a workspace switch.
    reconnect: () => void

> A route, and the plugin it came from.
### RegisteredRoute = Route &
    plugin: string
    fallback: ComponentType<FallbackProps> | undefined

> A page, and what it takes to see it.
### Route<Config = unknown, Services = unknown> =
    path: string
    component: ComponentType
    // What the tab says while this page is open.
    title: string
    // What the viewer must hold. This decides what renders, never what is allowed: the browser holds these strings, so the server must refuse the same request independently.
    requires?: readonly string[] | undefined
    // What this route reads from the query string.
    search?: z.ZodType | undefined
    // Where the viewer belongs instead, when this page is not it: asked before `requires`.
    instead?: ((ctx: Context<Config, Services>) => string | undefined) | undefined
    // "prerender" writes this page as HTML at build time; "server" renders it per request with the viewer's session; "client" (the default) renders it in the browser only. A prerendered page may hold no `requires` or `instead`.
    render?: "client" | "prerender" | "server" | undefined
    // Every set of parameters to prerender, for a path holding `$name` segments: `[{ id: "1" }]` for `/items/$id`.
    paths?: ((ctx: Context<Config, Services>) => readonly RouteParams[] | Promise<readonly RouteParams[]>) | undefined
    // Fetches what the page reads before it renders on a server, filling the cache the page reads from.
    load?: ((ctx: Context<Config, Services>, params: RouteParams) => void | Promise<void>) | undefined
    // What the page says to search engines and link previews, validated before it is written; `title` falls back to the route's.
    head?: ((ctx: Context<Config, Services>, params: RouteParams) => Head | Promise<Head>) | undefined

> A path's `$name` segments and what they matched.
### RouteParams = Readonly<Record<string, string>>

> What the router plugin offers: the tree, built from what plugins declared.
### Router
    build: (kernel: Kernel, frame: Frame, guard: (route: RegisteredRoute) => ComponentType) => unknown

> What building a router takes: the library, and what wraps every page.
> The shell comes from whichever plugin declared `frame`, so an application
> names neither it nor which plugin holds it.
### RouterBuilding
    building: RouterOptions
    // What renders where no route matched.
    missing: ComponentType
    // Where the matched page renders inside the frame; routers hand this over rather than passing children.
    outlet: ComponentType
    // Puts the outlet inside the frame a plugin declared, or answers the outlet alone where none did. Written here because `.` renders nothing itself.
    wrap: (frame: FunctionComponent<{
    children?: ReactNode
    }> | undefined, outlet: ComponentType) => ComponentType
    // What renders at `/` when no plugin declares it: a redirect to the first route there is.
    landing: (to: string) => ComponentType
    guard: (route: RegisteredRoute) => ComponentType
    // A history standing at one path (`createMemoryHistory({ initialEntries: [path] })`), for rendering that path on a server.
    history?: ((path: string) => unknown) | undefined

> The part of a router library this plugin drives.
### RouterOptions
    createRootRoute: (options: {
    component: ComponentType
    notFoundComponent: ComponentType
    }) => Root
    createRoute: (options: {
    getParentRoute: () => Root
    path: string
    component: ComponentType
    validateSearch?: (query: Record<string, unknown>) => unknown
    }) => Child
    createRouter: (options: {
    routeTree: Root
    }) => unknown

> The server half of a Vite config: a port of its own, refused when taken, and `/api` reaching the back.
### Serving
    port: number
    strictPort: true
    proxy: Record<string, {
    target: string
    changeOrigin: true
    rewrite: (path: string) => string
    }>

> What a development server needs to know, before any of it is a Vite option.
### ServingOptions
    port?: number
    apiPort?: number
    // Where each value is read from, so a caller passes what a bundler loaded.
    set?: Record<string, string | undefined>

> A place other plugins may render into.
### Slot = DescribableWithSchema

> What one plugin renders in another's slot.
### SlotContribution
    slot: string
    order?: number | undefined
    // What the viewer must hold. This decides what renders, never what is allowed: the browser holds these strings, so the server must refuse the same request independently.
    requires?: readonly string[] | undefined
    render: ComponentType<{
    payload: unknown
    }>

> What an application holds once it is up.
### StartedApp
    kernel: Kernel
    http: HttpClient
    realtime: Realtime
    // Which channel was live once every plugin had started: the socket is dialled only then, so it carries every plugin's `sends`.
    channel: "ws" | "http"
    // The router built from what plugins declared, where `start` was given one to build with.
    router: unknown
    // Stands the router at `path` and loads it, for rendering that path on a server; refuses without `router.history`.
    visit: (path: string) => Promise<void>
    // Stops the plugins, then the socket.
    stop: () => Promise<void>

> What an application says to bring itself up.
### StartOptions
    // The plugins it holds. `discover` finds them from the filesystem.
    plugins: readonly Plugin[]
    // Where the server is, and how to reach it.
    transport: TransportOptions
    config?: Readonly<Record<string, unknown>> | undefined
    // What the bundler exposes (`import.meta.env`): `VITE_<PLUGIN>__<FIELD>` reaches that plugin's config, under whatever `config` gives it.
    environment?: Readonly<Record<string, unknown>> | undefined
    // The page holds prerendered markup (`prerenderedState() !== undefined`): the router loads before `start` answers, so `hydrateRoot` matches what the server wrote.
    prerendered?: boolean | undefined
    permissions?: PermissionSource | undefined
    log?: Logger | undefined
    // Which plugin may answer what the viewer holds; any other declaring `grants` is refused. Left out, the one plugin declaring `grants` is that plugin, and may own permissions under its own name.
    grantedBy?: string | undefined
    // Dropping what a view holds. Omit and `ctx.cache` refuses, naming itself.
    cache?: Cache | undefined
    // The router library and the frame around every page. Omit and `router` is undefined, for an application rendering its own.
    router?: RouterBuilding | undefined

## cache

Imported whole, then reached through the name: `import { cache } from "@onetype/stack-app-kit";`. Its members have no import of their own.

> What the kernel needs to drop what a view is holding.
### cache.Cache
    invalidate: (key: readonly unknown[]) => void
    // Cancels what is still loading, drops every entry no view shows, and resets the ones a view shows so they fetch again: when the data's owner changed (a workspace switch, sign-out), not when some of it went stale.
    clear: () => void
    // Fetches `key` into the cache before a page renders, so the page reads it without a request and a server's state carries it.
    prefetch: (key: readonly unknown[], fetch: () => Promise<unknown>) => Promise<void>

> The cache, for a plugin that declared "cache" in needs.
### cache.from(host: Host): Cache | undefined

> Builds the cache the kernel hands every plugin.
### cache.fromQueries(client: Queries): Cache

> What this plugin offers itself as.
### cache.NAME = "cache"

> The part of a query client this plugin drives.
### cache.Queries
    invalidateQueries: (filters: {
    queryKey: unknown[]
    }) => unknown
    cancelQueries?: () => unknown
    removeQueries?: (filters: {
    type: "inactive"
    }) => void
    resetQueries?: () => unknown
    prefetchQuery?: (options: {
    queryKey: unknown[]
    queryFn: () => Promise<unknown>
    }) => Promise<void>

## logs

Imported whole, then reached through the name: `import { logs } from "@onetype/stack-app-kit";`. Its members have no import of their own.

### logs.captureErrors(log: Logger, source: ErrorSource): () => void

### logs.create(options: LoggerOptions): Logger

### logs.ErrorSource
    addEventListener: (kind: string, listener: (event: unknown) => void) => void
    removeEventListener: (kind: string, listener: (event: unknown) => void) => void

> The logs, for a plugin that declared "logs" in needs.
### logs.from(host: Host): Logs | undefined

### logs.Level = (typeof levels)[number]

### logs.levels: readonly ["debug", "info", "warn", "error"]

### logs.LogEntry
    level: Level
    at: string
    plugin: string | undefined
    line: string
    about: Readonly<Record<string, unknown>> | undefined

### logs.LoggerOptions
    level: Level
    write: LogWriter | readonly LogWriter[]
    now?: (() => Date) | undefined

> What `logs.from(host)` answers.
### logs.Logs
    // A leveled logger for `start({ log })`, handing every entry at or above `level` to each writer.
    create: typeof create
    // Batches, clips, redacts and sends entries at or above `level` (never below info); a 429 pauses it for a minute.
    shipper: typeof shipper

### logs.LogWriter = (entry: LogEntry) => void

> What this plugin offers itself as.
### logs.NAME = "logs"

### logs.postTo(url: string): (entries: readonly ShippedEntry[], isLeaving: boolean) => Promise<number>

### logs.ShippedEntry
    level: "info" | "warn" | "error"
    at: string
    plugin?: string
    line: string
    about?: Record<string, string | number | boolean | null>

### logs.shipper(options: ShipperOptions): Shipper

### logs.Shipper
    write: (entry: LogEntry) => void
    flush: (isLeaving: boolean) => void

### logs.ShipperOptions
    level: Level
    send: (entries: readonly ShippedEntry[], isLeaving: boolean) => Promise<number>
    every: (run: () => void) => void
    now?: (() => number) | undefined

### logs.toConsole: LogWriter

## router

Imported whole, then reached through the name: `import { router } from "@onetype/stack-app-kit";`. Its members have no import of their own.

> A child route, deliberately `unknown`: it constrains nothing, and whatever your router library returns passes.
### router.Child = unknown

> What the frame around every page needs.
### router.Frame
    shell: ComponentType
    missing: ComponentType
    // What renders at `/` when no plugin declares it: a redirect to the first route there is.
    landing: (to: string) => ComponentType

> The router, for a plugin that declared "router" in needs.
### router.from(host: Host): Router | undefined

> What this plugin offers itself as.
### router.NAME = "router"

> The route-tree root your router library returned, which takes the pages plugins declared.
### router.Root
    addChildren: (children: Child[]) => Root

> What the router plugin offers: the tree, built from what plugins declared.
### router.Router
    build: (kernel: Kernel, frame: Frame, guard: (route: RegisteredRoute) => ComponentType) => unknown

> The part of a router library this plugin drives.
### router.RouterOptions
    createRootRoute: (options: {
    component: ComponentType
    notFoundComponent: ComponentType
    }) => Root
    createRoute: (options: {
    getParentRoute: () => Root
    path: string
    component: ComponentType
    validateSearch?: (query: Record<string, unknown>) => unknown
    }) => Child
    createRouter: (options: {
    routeTree: Root
    }) => unknown

### router.tree(kernel: Kernel, building: RouterOptions, frame: Frame, guard: (route: RegisteredRoute) => ComponentType): unknown

## seo

Imported whole, then reached through the name: `import { seo } from "@onetype/stack-app-kit";`. Its members have no import of their own.

> The seo helpers, for a plugin that declared "seo" in needs.
### seo.from(host: Host): Seo | undefined

> What this plugin offers itself as.
### seo.NAME = "seo"

### seo.robotsTxt(origin: string, disallow?: readonly string[]): string

> What `seo.from(host)` answers.
### seo.Seo
    // A sitemap of every indexed page, with hreflang alternates.
    sitemapXml: typeof sitemapXml
    // A robots.txt allowing everything but `disallow`, naming the sitemap.
    robotsTxt: typeof robotsTxt

> Every problem a prerender found, before it wrote anything.
### seo.SeoFault extends Error
    readonly code = "REFUSED_PRERENDER"
    readonly problems: readonly string[]
    constructor(problems: readonly string[])

### seo.SitemapPage
    path: string
    isIndexed: boolean
    alternates: readonly {
    locale: string
    href: string
    }[]

### seo.sitemapXml(origin: string, pages: readonly SitemapPage[]): string

## server

Imported whole, then reached through the name: `import { server } from "@onetype/stack-app-kit";`. Its members have no import of their own.

> The server plugin, for a plugin that declared "server" in needs.
### server.from(host: Host): Server | undefined

> What this plugin offers itself as.
### server.NAME = "server"

> What `server.from(host)` answers: nothing to call in a browser; the work is in the `./server` entry.
### server.Server
    // The entry a Node process imports for prerendering and rendering per request.
    entry: "@onetype/stack-app-kit/server"

## settings

Imported whole, then reached through the name: `import { settings } from "@onetype/stack-app-kit";`. Its members have no import of their own.

### settings.BuildGuard
    name: string
    configResolved: (config: ResolvedBuild) => void

### settings.configFor(plugins: readonly Plugin[], environment: Readonly<Record<string, unknown>>): PluginConfig

> The settings, for a plugin that declared "settings" in needs.
### settings.from(host: Host): Settings | undefined

> What this plugin offers itself as.
### settings.NAME = "settings"

### settings.PluginConfig = Readonly<Record<string, Readonly<Record<string, string>>>>

### settings.problemsOf(names: readonly string[], options?: PublicOptions): string[]

### settings.PublicOptions = Partial<PublicRule>

### settings.refusingSecrets(options?: Omit<PublicOptions, "prefixes">): BuildGuard

### settings.ResolvedBuild
    env: Readonly<Record<string, unknown>>
    envPrefix?: string | readonly string[] | undefined

> What `settings.from(host)` answers.
### settings.Settings
    // Maps `VITE_<PLUGIN>__<FIELD>` variables onto each plugin's config, or throws every problem at once.
    configFor: typeof configFor
    // Every public variable that should not ship, one sentence each; empty when all may.
    problemsOf: typeof publicProblemsOf

> Every problem found at once, one line each; `problems` lets a caller show them apart.
### settings.SettingsFault extends Error
    readonly code = "REFUSED_SETTINGS"
    readonly problems: readonly string[]
    constructor(what: string, problems: readonly string[])

## transport

Imported whole, then reached through the name: `import { transport } from "@onetype/stack-app-kit";`. Its members have no import of their own.

> Joins `baseUrl`, `path` and `query` into one URL, dropping null and undefined values; a relative `baseUrl` stays relative.
### transport.address(baseUrl: string, path: string, query?: Readonly<Record<string, string | number | boolean | null | undefined>>): string

> Which channel is carrying requests now.
### transport.Channel = "ws" | "http"

> The transport, for a plugin that declared "transport" in needs.
### transport.from(host: Host): Transport | undefined

> The five verbs this transport sends: GET, POST, PUT, PATCH and DELETE.
### transport.HttpMethod = (typeof METHODS)[number]

> One request. Everything a caller may say about what it wants.
### transport.HttpRequest
    method: HttpMethod
    path: string
    query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined
    body?: unknown
    headers?: Readonly<Record<string, string>> | undefined
    signal?: AbortSignal | undefined

> What this plugin offers itself as.
### transport.NAME = "transport"

> The socket shape this plugin drives.
### transport.Socket
    send: (data: string) => void
    close: () => void
    addEventListener: (kind: string, run: (event: unknown) => void) => void

> What a caller holds to stop receiving.
### transport.Subscription
    close: () => void

> The one HTTP boundary.
### transport.Transport
    // Tries the socket once and answers which channel is live.
    connect: () => Promise<Channel>
    // Which channel is carrying now.
    channel: () => Channel
    // One request. The body comes back as unknown, so the caller validates.
    request: (request: HttpRequest) => Promise<unknown>
    // Server-pushed messages. With no socket this succeeds and delivers nothing. `refused` hears the server decline the channel (unknown and forbidden read alike).
    subscribe: (topic: string, receive: (message: unknown) => void, refused?: (code: string) => void) => Subscription
    // Closes the socket and dials again with the address as it reads now, keeping every subscription; a socket closed as signed out (4001) waits for this.
    reconnect: () => void
    // Stops the socket for good.
    close: () => void

> A refused request, carrying what it was and what came back.
### transport.TransportFault extends Error
    readonly code: TransportFaultCode
    readonly status: number | undefined
    readonly method: string
    readonly path: string
    readonly retryable: boolean
    readonly body: unknown
    constructor(code: TransportFaultCode, message: string, about: FaultDetail)
    static fromStatus(status: number, about: {
    method: string
    path: string
    body?: unknown
    }): TransportFault
    toString(): string

> What a request was refused for. A closed union, so a caller can branch.
### transport.TransportFaultCode
    | "NETWORK"
    | "TIMEOUT"
    | "ABORTED"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "SERVER"
    | "CLIENT"
    | "MALFORMED"
    | "OFF_BASE"

> What the plugin needs before it can dial anything.
### transport.TransportOptions
    baseUrl: string
    // Where the socket dials. A function is read on every dial and redial with the headers a request would carry now
    // (`headers` and every plugin's), so the address can follow the viewer; answering undefined keeps the socket closed until `reconnect()`.
    wsUrl?: string | ((sent: Readonly<Record<string, string>>) => string | undefined) | undefined
    // "requests" (the default) sends requests over the socket while it is open; "push" keeps every request on HTTP and the socket for pushes only.
    socketFor?: "requests" | "push" | undefined
    openSocket?: ((url: string) => Socket) | undefined
    headers?: (() => Readonly<Record<string, string>>) | undefined
    onUnauthorized?: ((path: string) => void) | undefined
    timeoutMs?: number
    retries?: number
    retryBaseMs?: number
    connectTimeoutMs?: number
    reconnectBaseMs?: number
    sleep?: ((ms: number) => Promise<void>) | undefined
    // Spreads every retry and redial between half and all of its backoff, so the tabs of a restarted server do not return in the same instant.
    random?: (() => number) | undefined
    // Once the server has sent `$ping`, a socket silent this long is closed and dialled again (60 s by default). A server that never pings is never timed.
    silenceMs?: number | undefined
    // Hands a listener to whatever says the device is back (online, a tab shown again); the socket then redials at once rather than waiting its backoff. Answers a stop.
    wake?: ((listener: () => void) => () => void) | undefined
    // Runs once a socket after the first is settled: the server said `$ready` and answered every subscription, or said nothing within `connectTimeoutMs`. Pushes sent while it was down are lost, so this is when to fetch again.
    onReconnected?: ((about: {
    downMs: number
    }) => void) | undefined

# @onetype/stack-app-kit/react

## Functions

> Puts a kernel in reach of everything below it.
### KernelProvider({ kernel, children }: { kernel: Kernel; children: ReactNode }): ReactNode
    kernel: Kernel
    children: ReactNode

> The 404, for a path nothing declared.
### NotFound(): ReactNode

> What a prerender wrote for the cache to hydrate from (`<script id="kit-state">`), or undefined on a page the browser rendered first.
### prerenderedState(): unknown

> A page, and what it takes to see it; `params` are what the path matched, for the route's `head`.
### RouteGuard({ route, send, params }: { route: RegisteredRoute; send?: (to: string) => ReactNode; params?: RouteParams }): ReactNode
    route: RegisteredRoute
    send?: (to: string) => ReactNode
    params?: RouteParams

> Renders every contribution to a slot.
### Slot({ name, payload }: { name: string; payload?: unknown }): ReactNode
    name: string
    payload?: unknown

> What a refused start looks like.
### StartupFailure({ message }: StartupFailureProps): ReactNode

> Replaces the built-in 403 and 404.
### StatusPageProvider({ pages, children }: { pages: Partial<StatusPages>; children: ReactNode }): ReactNode
    pages: Partial<StatusPages>
    children: ReactNode

> Calls `onDismiss` on Escape, or on a pointer press outside both the element and its anchor.
### useDismiss: (isOpen: boolean, inside: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null> | undefined, onDismiss: () => void) => void

> Hears an event for as long as this component is on screen; `listener` is the plugin doing the listening, which must depend on the one that owns the event.
### useEvent(listener: string, event: string, handle: (payload: unknown) => void): void

> Wraps a handler so its identity never changes while always calling the latest version.
### useEventCallback: <Args extends readonly unknown[]>(handler: (...args: Args) => void) => ((...args: Args) => void)

> Holds Tab focus inside the element while active, and restores the previous focus on exit.
### useFocusTrap: (active: boolean, ref: RefObject<HTMLElement | null>) => void

> The frame every page renders inside, from whichever plugin owns it.
### useFrame(): FunctionComponent<{ children?: ReactNode }>
    children?: ReactNode

> The kernel, for a component under a provider.
### useKernel(): Kernel

> One plugin's context and services, by name.
### usePlugin<Config = unknown, Services = unknown>(name: string): PluginHandle<Config, Services>

> Reads a value a service keeps, and re-renders when it changes.
### useStore<Value>(watch: (notify: () => void) => () => void, read: () => Value): Value

## Types

> What a plugin holds: its config, its services, and everything a context carries.
### PluginHandle<Config = unknown, Services = unknown> = Context<Config, Services>

> A place other plugins may render into.
### Slot = DescribableWithSchema

> The one message `StartupFailure` shows: the reason the kernel refused to boot.
### StartupFailureProps
    message: string

> The pages shown when a viewer may not see something, or nothing matched.
### StatusPages
    forbidden: ComponentType<{
    permission?: string | undefined
    }>
    missing: ComponentType

# @onetype/stack-app-kit/testing

## Functions

> Set once per test process (a setup file). From then on `start` adds every plugin the given ones depend on,
> transitively: a plugin the test passed wins by name, so a stand-in stays one, dependencies come first, and
> otherwise the given order holds. A name nothing provides is still refused as UNKNOWN_DEPENDENCY.
> Never called, `start` boots exactly what it was given. Only `./testing` exports it.
### configureTestKernels(fixture: TestKernels): void

> A context that answers the way the real one does.
### fakeContext<Config = unknown, Services = unknown>(answers?: Answers, faking?: Faking<Config>): Fake<Config, Services>

> Every comment line in `.ts`, `.tsx` and `.css` under `source`, counting a block once per line and ignoring anything inside a string, template or regex.
### findComments(source: string): Commented[]

> Aliases whose target is not on disk, in every file that declares one.
### findDanglingPaths(root: string, files?: readonly string[]): DanglingPath[]

> Where the composition root, or anything beside it, imports through a plugin alias.
> A root reaching into `@plugins/` names one plugin and stops being a root:
> removing that plugin then breaks the boot rather than removing a capability.
### findEntryReach(root: string, entries?: readonly string[]): EntryReach[]

> Every crossing under `root` that was undeclared, reached past `@plugins/<name>`, looped, or sat in a folder with no plugin.ts.
### findImportViolations(root: string): ImportViolation[]

> Every raw colour, length and duration written outside the sheets that declare them.
### findLiterals(root: string, alsoIn?: readonly string[]): Literal[]

> Which of `required` are absent under `root` or present but blank; unreadable counts as missing.
### findMissingDocs(root: string, required: readonly string[]): string[]

> Every `.md` under `root` longer than `maxCharacters` (1800 by default), skipping any path holding "progress".
### findOversizedDocs(root: string, maxCharacters?: number): OversizedDoc[]

> TSDoc in `source` whose opening sentence is absent from the built types in `dist`; throws when `dist` holds no build, so build first.
### findPrivateComments(source: string, dist: string): PrivateComment[]

> A component a plugin wrote for itself, where one it depends on exports the same name.
### findShadowedExports(root: string): ShadowedExport[]

> A util two plugins wrote for themselves, matched by name and signature.
### findSharedNames(root: string): DuplicateSignature[]

> One vocabulary two plugins each wrote out, matched by name and by members.
### findSharedVocabulary(root: string): DuplicateSignature[]

> Same-named `z.enum` declarations in two plugins that share members yet differ, reported only when one plugin reaches the other.
### findSplitVocabulary(root: string): SplitVocabulary[]

> Keys of `type Definition` in `contract` that `procedure` never names in backticks; throws when no Definition parses.
### findUndocumentedKeys(contract: string, procedure: string): string[]

> The plugins with no `usage.md`, or one that says nothing.
### findUnexplainedPlugins(plugins: string): string[]

> Every `styles.name` a component reads that its own module never declares.
### findUnknownClasses(root: string): UnknownClass[]

> Every `var(--name)` a stylesheet asks for that nothing declares.
### findUnknownTokens(root: string): UnknownToken[]

> Counts style-carrying lines per non-CSS file under `root`; paths starting with an `alsoIn` prefix are skipped, the opposite of how `findLiterals` reads it.
### findUnmeasured(root: string, alsoIn?: readonly string[]): Unmeasured[]

> Fields of exported types and interfaces under `root` that no file reads, matched by name and so blind to a field two shapes share.
### findUnusedFields(root: string): UnusedField[]

> Every non-exported type or interface under `root`; exported ones are left to `findUnusedFields` so neither counts twice.
### findUnwatched(root: string): Unwatched[]

> Every check an application runs on itself, in one call.
### Project: { required: readonly ["#docs/usage.md", "#docs/stack.md", "#docs/architecture.md"]; findAll: (checking?: ProjectCheckOptions) => ProjectProblem[]; /** Every check that could not run, and what it would have read. */ findSkipped: (checking?: ProjectCheckOptions) => ProjectSkipped[] }
    required: readonly ["#docs/usage.md", "#docs/stack.md", "#docs/architecture.md"]
    findAll: (checking?: ProjectCheckOptions) => ProjectProblem[]
    // Every check that could not run, and what it would have read.
    findSkipped: (checking?: ProjectCheckOptions) => ProjectSkipped[]

> Forgets what `configureTestKernels` set, so `start` boots exactly what it is given again.
### resetTestKernels(): void

> The same closure over dependsOn, for a test building its kernel with `createKernel` rather than `start`.
### withDependencies(plugins: readonly Plugin[]): Promise<readonly Plugin[]>

## Types

> What routes a fake answers, keyed by the address the transport dials:
> `"GET /parts"`, or `"GET /parts?take=3&from=a"` where the call carries a
> query. Parameters land in the order the object wrote them, not sorted.
### Answers = Readonly<Record<string, unknown>>

> Where a comment sits: the file, and the line it was written on.
### Commented
    file: string
    line: number

### DanglingPath
    alias: string
    target: string
    // Which map declared it, since a project keeps more than one.
    file: string

> One signature found in more than one plugin, with every plugin and file that wrote it.
### DuplicateSignature
    signature: string
    plugins: readonly string[]
    files: readonly string[]

> One event a plugin announced.
### EmittedEvent
    event: string
    payload: unknown

### EntryReach
    file: string
    // The alias it reached through, which belongs to a plugin rather than to the root.
    alias: string

> A fake context, and everything that reached it.
### Fake<Config = unknown, Services = unknown> =
    ctx: Context<Config, Services>
    // Every request, in order.
    requests: readonly FakeRequest[]
    // Every event announced.
    announced: readonly EmittedEvent[]
    // Every cache key dropped.
    invalidated: readonly (readonly unknown[])[]
    // Every command run.
    commanded: readonly RanCommand[]
    // Every line logged, by level.
    logged: readonly {
    level: string
    line: string
    }[]
    // How many times the plugin said what a viewer may do had moved.
    regranted: number
    // How many times the plugin asked the socket to be dialled again.
    reconnected: number
    // How many times the plugin dropped the whole cache.
    cleared: number
    // Every key the plugin fetched ahead, in order.
    prefetched: unknown[][]
    // What `ctx.hooks.run` answers next. Set it to refuse.
    refusal: string | undefined
    // Sends a message on a channel, as a server would.
    push: (topic: string, message: unknown) => void
    // Declines a channel, as a server would: every `refused` given to that channel's subscribe hears the code.
    refuse: (topic: string, code?: string) => void

> One request a plugin made, as the fake recorded it.
### FakeRequest
    method: string
    path: string
    query?: Readonly<Record<string, unknown>> | undefined
    body?: unknown
    headers?: Readonly<Record<string, string>> | undefined

> A status a route answers with, and whatever came with it.
### FakeResponse
    status: number
    body?: unknown

> What a fake was given, beyond its answers.
### Faking<Config>
    name?: string
    config?: Config
    services?: unknown
    // What `ctx.permissions` answers. Everything, unless a list is given.
    permissions?: readonly string[]
    // What `ctx.hooks.run` answers: a reason refuses, nothing allows.
    refusal?: string | undefined
    // What each named plugin's `ctx.use` hands back.
    offering?: Readonly<Record<string, unknown>>

> A plugin a test did not name, and the config it boots with; config is only ever given to a plugin the closure added.
### FoundPlugin
    plugin: Plugin
    config?: unknown

> One import that crossed from one plugin into another, as the specifier wrote it.
### ImportEdge
    from: string
    to: string
    specifier: string

> A crossing the rules refuse, already phrased as the sentence a failing test prints.
### ImportViolation
    rule: "undeclared" | "deep" | "cycle" | "contract" | "twice"
    message: string

> A markdown file past the character limit, with the size it reached.
### OversizedDoc
    path: string
    size: number

> A TSDoc sentence in source that no built `.d.ts` carries, so no consumer ever reads it.
### PrivateComment
    file: string
    line: number
    sentence: string

### ProjectCheckOptions
    root?: string
    plugins?: string
    // Where pure code shared between plugins lives.
    utils?: string
    // Where the documents sit while they are a folder.
    docs?: string
    // Documents this application asks itself to hold; none unless named. `Project.required` is the kit's suggestion.
    required?: readonly string[]
    // The size a document may reach before it has outgrown its point.
    maxCharacters?: number
    // The published type declaring `Definition`, read to list the keys a plugin may declare.
    contract?: string
    // Documents a worked example fills, each named, and the ceiling they are still held to.
    worked?: readonly string[]
    workedMaxCharacters?: number
    // Where style lives outside a stylesheet, as paths under `src`.
    styleIn?: readonly string[]
    // Signatures two plugins may each keep, because they answer different questions.
    sharing?: readonly string[]
    // Components a plugin writes for itself although one it depends on exports the same name.
    shadowing?: readonly string[]
    // Enum names two plugins may each declare, where the two are not one idea.
    separateEnums?: readonly string[]
    // Where the other half of this application lives, when it has one.
    otherStacks?: readonly string[]
    // Built files that must stay under a size, gzipped, as bytes.
    budgets?: Readonly<Record<string, number>>

> One thing a run found wrong, tagged with the check that found it and phrased for a reader.
### ProjectProblem
    check: "boundaries" | "wiring" | "unexplained" | "token" | "class" | "comment" | "literal" | "oversized" | "missing" | "dangling" | "twice" | "budget" | "split" | "shadowed" | "reach" | "undocumented"
    message: string

> What a run did not look at, and why.
### ProjectSkipped
    check: string
    message: string

> One command a plugin ran through `ctx.commands`.
### RanCommand
    command: string
    input: unknown

> A component folder whose name a plugin's own dependency already exports.
### ShadowedExport
    plugin: string
    component: string
    owner: string
    file: string

> Two plugins' same-named enums that overlap but disagree: `shared` is in both, `disagreed` in only one.
### SplitVocabulary
    name: string
    plugins: readonly string[]
    files: readonly string[]
    shared: readonly string[]
    disagreed: readonly string[]

> Where the plugins a test did not name come from. `resolve` runs once per name, only for one nothing given provides.
### TestKernels
    resolve: (name: string) => FoundPlugin | undefined | Promise<FoundPlugin | undefined>

> A `Definition` key the written procedure never mentions.
### UndocumentedKey
    key: string

> A `styles.name` a component reads that its own CSS module never declares.
### UnknownClass
    file: string
    name: string

> A `var(--name)` a stylesheet reads that nothing gives a value.
### UnknownToken
    file: string
    token: string

> A file outside the stylesheets holding raw colours, lengths or durations, and how many lines do.
### Unmeasured
    file: string
    holds: number

> A field an exported shape declares that nothing anywhere reads.
### UnusedField
    file: string
    shape: string
    field: string

> A shape declared without `export`, which no field check ever looks inside.
### Unwatched
    file: string
    shape: string

# @onetype/stack-app-kit/server

## Functions

> Renders a route declared `render: "server"` for one request, with a kit of its own: the api sees this viewer's cookie
> and no other request's, and the head is resolved, checked and written before the page streams. Answers undefined for
> a request it does not render (not GET or HEAD, or no server route matches), for the host to serve `_shell.html`.
### handle(request: Request, options: HandleOptions): Promise<Response | undefined>

> Writes every route declared `render: "prerender"`, once per set its `paths` answer, as `<outDir><path>/index.html`,
> then `sitemap.xml` and `robots.txt`. Every head is validated and every path checked before anything is written;
> a problem anywhere throws `SeoFault` naming them all.
### prerender(options: PrerenderOptions): Promise<readonly PrerenderedPage[]>

> The default export of a prerender entry: starts the app once, then writes every prerendered route through `prerender`.
### prerenderApp(options: PrerenderAppOptions): (output: BuildOutput) => Promise<readonly PrerenderedPage[]>

> A Vite plugin: once the client is built, builds `entry` for the server, runs its default export with the built
> `index.html`, and removes the server build. Skips the nested server build it starts, and every command but `build`.
> In a production build, an origin that is missing or not absolute http(s) stops the build.
### prerenderOnBuild(options: PrerenderOnBuildOptions): { name: string; configResolved: (resolved: ResolvedBuildConfig) => void; closeBundle: () => Promise<void> }
    name: string
    configResolved: (resolved: ResolvedBuildConfig) => void
    closeBundle: () => Promise<void>

> A `respond` for `handle` that renders `tree` into `template` (the built `_template.html`), as a prerender does: the router already stands at the path.
### respondWith(options: { template: string; tree: (app: StartedApp) => ReactNode }): (app: StartedApp) => Promise<Response>
    template: string
    tree: (app: StartedApp) => ReactNode

## Types

> What a build hands the entry `prerenderOnBuild` built: the client's template, where the site is served, and where pages go.
### BuildOutput
    template: string
    origin: string
    outDir: string

> What `handle` needs: a fresh app per request, and how that app renders its document.
### HandleOptions
    // Starts the app for one viewer: pass `session.headers` as the transport's headers, so the api sees who is asking.
    start: (session: Session) => Promise<StartedApp>
    // Renders the whole document with the app's router (a streamed `Response`); the kit writes the head into it.
    respond: (app: StartedApp, request: Request) => Promise<Response>
    // What the client hydrates its cache from, read once the page loaded.
    state?: ((app: StartedApp) => unknown) | undefined

> What `prerenderApp` needs: the same app and tree the browser starts, built once for every page.
### PrerenderAppOptions
    // Starts the app as the browser does, with one query client given to `cache.fromQueries` and read by `state`.
    start: () => Promise<StartedApp>
    // The one tree `main.tsx` also renders, so server and client cannot drift.
    tree: (app: StartedApp) => ReactNode
    state?: (() => unknown) | undefined
    disallow?: readonly string[] | undefined

> One page written, and what it said about itself.
### PrerenderedPage
    path: string
    file: string

> What `prerenderOnBuild` takes: the entry whose default export `prerenderApp` answered, and where the site is served.
### PrerenderOnBuildOptions
    entry: string
    origin: string | undefined

> What `prerender` needs: a started app, how to render one path, and where the pages go.
### PrerenderOptions
    app: StartedApp
    // The same tree the browser renders, for one path: typically a router on memory history, loaded.
    render: (path: string) => ReactNode | Promise<ReactNode>
    // The built `index.html`, holding `<!--kit-head-->` and `<!--kit-app-->`.
    template: string
    // Where the site is served, for the sitemap: `https://shop.example`.
    origin: string
    outDir: string
    // What the client hydrates its cache from, read after every page loaded: `() => dehydrate(queryClient)`.
    state?: (() => unknown) | undefined
    // Paths robots.txt asks crawlers to leave alone: the client-only part of the site.
    disallow?: readonly string[] | undefined
    // Where the untouched template is written (`_shell.html` by default), for the host to serve every path with no page of
    // its own. Prerendering `/` rewrites `index.html`, so falling back to it would hand a client route the home page.
    fallback?: string | undefined
    // Writes one file; the file system by default, a map in a test.
    write?: ((file: string, contents: string) => Promise<void>) | undefined

> What a request forwards to the api on the viewer's behalf: the cookie and the language, nothing else.
### Session
    headers: Readonly<Record<string, string>>
