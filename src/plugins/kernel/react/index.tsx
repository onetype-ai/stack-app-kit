import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type FunctionComponent, type ReactNode } from "react";

import { KernelFault, checkHead, tagsOf } from "../api";
import type { Context, FallbackProps, HeadTag, RegisteredRoute, RouteParams } from "../api";
import type { Kernel } from "../internal/kernel";

export { StartupFailure } from "./StartupFailure";
export { AppBoundary } from "./AppBoundary";
export type { AppBoundaryProps, AppFailureProps } from "./AppBoundary";
export { StreamedText } from "./StreamedText";
export type { StreamedTextProps } from "./StreamedText";
export type { StartupFailureProps } from "./StartupFailure";

export { useDismiss } from "./hooks/useDismiss";
export { useEventCallback } from "./hooks/useEventCallback";
export { useFocusTrap } from "./hooks/useFocusTrap";

const KernelContext = createContext<Kernel | undefined>(undefined);

/** The pages shown when a viewer may not see something, or nothing matched. */
export type StatusPages = {
    forbidden: ComponentType<{ permission?: string | undefined }>;
    missing: ComponentType;
};

const fallbackPages: StatusPages = {
    forbidden: () =>
    {
        return <p role="alert">You do not have permission to see this.</p>;
    },
    missing: () =>
    {
        return <p role="alert">This page does not exist.</p>;
    },
};

const Pages = createContext<StatusPages | undefined>(undefined);

function usePages(): StatusPages
{
    const replaced = useContext(Pages);
    const kernel = useKernel();
    const owned = kernel.pages();

    return {
        forbidden: replaced?.forbidden ?? owned.forbidden ?? fallbackPages.forbidden,
        missing: replaced?.missing ?? owned.missing ?? fallbackPages.missing,
    };
}

/** Puts a kernel in reach of everything below it. */
export function KernelProvider({ kernel, children }: { kernel: Kernel; children: ReactNode }): ReactNode
{
    return <KernelContext.Provider value={kernel}>{children}</KernelContext.Provider>;
}

/** Replaces the built-in 403 and 404. */
export function StatusPageProvider({ pages, children }: { pages: Partial<StatusPages>; children: ReactNode }): ReactNode
{
    const outer = useContext(Pages);
    const next = useMemo(() => ({ ...fallbackPages, ...outer, ...pages }), [outer, pages]);

    return <Pages.Provider value={next}>{children}</Pages.Provider>;
}

/** The kernel, for a component under a provider. */
export function useKernel(): Kernel
{
    const kernel = useContext(KernelContext);

    if (kernel === undefined)
    {
        throw new KernelFault("NOT_STARTED", "useKernel was called outside a KernelProvider. Render it inside <KernelProvider kernel={app.kernel}>.");
    }

    return kernel;
}

/** What a plugin holds: its config, its services, and everything a context carries. */
export type PluginHandle<Config = unknown, Services = unknown> = Context<Config, Services>;

/** One plugin's context and services, by name. */
export function usePlugin<Config = unknown, Services = unknown>(name: string): PluginHandle<Config, Services>
{
    return useKernel().context(name) as PluginHandle<Config, Services>;
}

/** Hears an event for as long as this component is on screen; `listener` is the plugin doing the listening, which must depend on the one that owns the event. */
export function useEvent(listener: string, event: string, handle: (payload: unknown) => void): void
{
    const kernel = useKernel();
    const latest = useRef(handle);

    latest.current = handle;

    useEffect(() =>
    {
        return kernel.context(listener).events.on(event, (payload) =>
        {
            latest.current(payload);
        });
    }, [kernel, listener, event]);
}

/** Reads a value a service keeps, and re-renders when it changes. */
export function useStore<Value>(
    watch: (notify: () => void) => () => void,
    read: () => Value,
): Value
{
    const latestWatch = useRef(watch);
    const latestRead = useRef(read);

    latestWatch.current = watch;
    latestRead.current = read;

    const subscribe = useCallback((notify: () => void) =>
    {
        return latestWatch.current(notify);
    }, []);

    const snapshot = useCallback(() =>
    {
        return latestRead.current();
    }, []);

    const checked = useRef(false);

    if (!checked.current)
    {
        checked.current = true;

        if (!Object.is(read(), read()))
        {
            throw new KernelFault(
                "INVALID_CONFIG",
                "useStore was given a read that answers something different every "
                + "call, so React re-renders forever. Answer the value the service "
                + "already holds, or read one field at a time.",
            );
        }
    }

    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Renders every contribution to a slot. */
export function Slot({ name, payload }: { name: string; payload?: unknown }): ReactNode
{
    const kernel = useKernel();
    const { contributions, payload: answered, problem } = kernel.slot(name, payload);

    useGranting();

    if (problem !== undefined)
    {
        return <FailedSlot name={name} problem={problem} />;
    }

    return (
        <>
            {contributions
                .map((contribution, at) => ({ contribution, at }))
                .map(({ contribution, at }) => (
                    <Boundary
                        key={`${contribution.plugin}:${contribution.slot}:${String(at)}`}
                        plugin={contribution.plugin}
                        fallback={kernel.fallbackFor(contribution.plugin)}
                    >
                        <contribution.render payload={answered} />
                    </Boundary>
                ))}
        </>
    );
}

function useGranting(): void
{
    const kernel = useKernel();

    const watch = useCallback((notify: () => void) =>
    {
        return kernel.permissions.watch(notify);
    }, [kernel]);

    const turn = useRef(0);

    const read = useCallback(() =>
    {
        return turn.current;
    }, []);

    useSyncExternalStore((notify) => watch(() =>
    {
        turn.current += 1;
        notify();
    }), read, read);
}

function useMissingPermissions(route: RegisteredRoute): readonly string[]
{
    const kernel = useKernel();

    const watch = useCallback((notify: () => void) =>
    {
        return kernel.permissions.watch(notify);
    }, [kernel]);

    const lacking = useCallback(() =>
    {
        return (route.requires ?? []).filter((permission) => !kernel.permissions.has(permission)).join(" ");
    }, [kernel, route]);

    return useSyncExternalStore(watch, lacking, lacking).split(" ").filter(Boolean);
}

const ownedByHead = "data-kit-head";

function applyHead(tags: readonly HeadTag[]): void
{
    document.head.querySelectorAll(`[${ownedByHead}]`).forEach((stale) =>
    {
        stale.remove();
    });

    for (const one of tags)
    {
        if (one.tag === "title")
        {
            document.title = one.text;

            continue;
        }

        const element = document.createElement(one.tag);

        for (const [key, value] of Object.entries(one.attributes))
        {
            element.setAttribute(key, value);
        }

        if (one.tag === "script")
        {
            element.textContent = one.text;
        }

        element.setAttribute(ownedByHead, "");
        document.head.append(element);
    }
}

function useHead(kernel: Kernel, route: RegisteredRoute, params: RouteParams): void
{
    const paramsKey = JSON.stringify(params);

    useEffect(() =>
    {
        let isCurrent = true;
        const ctx = kernel.context(route.plugin);
        const fallback = [{ tag: "title" as const, text: route.title }];

        Promise.resolve(route.head?.(ctx, JSON.parse(paramsKey) as RouteParams) ?? {})
            .then((given) =>
            {
                if (!isCurrent)
                {
                    return;
                }

                const checked = checkHead(given);

                if ("problems" in checked)
                {
                    ctx.log.error(`head of "${route.path}" was refused`, { problems: checked.problems.map((one) => `${one.field}: ${one.problem}`).join("; ") });
                    applyHead(fallback);

                    return;
                }

                applyHead(tagsOf(checked.head, route.title));
            })
            .catch((cause: unknown) =>
            {
                ctx.log.error(`head of "${route.path}" threw`, { cause: cause instanceof Error ? cause.message : String(cause) });

                if (isCurrent)
                {
                    applyHead(fallback);
                }
            });

        return () =>
        {
            isCurrent = false;
        };
    }, [kernel, route, paramsKey]);
}

/** A page, and what it takes to see it; `params` are what the path matched, for the route's `head`. */
export function RouteGuard({ route, send, params = {} }: { route: RegisteredRoute; send?: (to: string) => ReactNode; params?: RouteParams }): ReactNode
{
    const kernel = useKernel();
    const pages = usePages();
    const lacking = useMissingPermissions(route);

    useHead(kernel, route, params);

    const elsewhere = route.instead?.(kernel.context(route.plugin));

    if (elsewhere !== undefined)
    {
        // A `?next=` parameter is where `instead` usually reads from, so what
        // it answers is attacker-shaped: an absolute URL sends the viewer off
        // the app, and "javascript:" runs in the page. Only a path travels.
        const inside = elsewhere.startsWith("/") && !elsewhere.startsWith("//") && !elsewhere.startsWith("/\\");

        if (!inside)
        {
            throw new KernelFault(
                "INVALID_ROUTE",
                `"${route.plugin}" answered "${elsewhere}" for where the viewer belongs instead, and only a path inside this app may be answered. Return one starting with "/".`,
                { plugin: route.plugin },
            );
        }

        return send === undefined ? null : send(elsewhere);
    }

    if (typeof document !== "undefined")
    {
        document.title = route.title;
    }

    if (lacking.length > 0)
    {
        return <pages.forbidden permission={lacking[0]} />;
    }

    return (
        <Boundary plugin={route.plugin} fallback={route.fallback}>
            <route.component />
        </Boundary>
    );
}

/** What a prerender wrote for the cache to hydrate from (`<script id="kit-state">`), or undefined on a page the browser rendered first. */
export function prerenderedState(): unknown
{
    const written = typeof document === "undefined" ? null : document.getElementById("kit-state")?.textContent ?? null;

    if (written === null)
    {
        return undefined;
    }

    try
    {
        return JSON.parse(written) as unknown;
    }
    catch
    {
        return undefined;
    }
}

/** The 404, for a path nothing declared. */
export function NotFound(): ReactNode
{
    const pages = usePages();

    return <pages.missing />;
}

/** The frame every page renders inside, from whichever plugin owns it. */
export function useFrame(): FunctionComponent<{ children?: ReactNode }>
{
    return useKernel().frame() ?? Bare;
}

function Bare(): ReactNode
{
    return null;
}

function FailedSlot({ name, problem }: { name: string; problem: string }): ReactNode
{
    return (
        <p role="alert" data-slot={name}>
            {problem}
        </p>
    );
}

type BoundaryProps = {
    plugin: string;
    fallback: ComponentType<FallbackProps> | undefined;
    children: ReactNode;
};

type BoundaryState = { error: unknown };

class Boundary extends Component<BoundaryProps, BoundaryState>
{
    override state: BoundaryState = { error: undefined };

    static getDerivedStateFromError(error: unknown): BoundaryState
    {
        return { error };
    }

    override render(): ReactNode
    {
        if (this.state.error === undefined)
        {
            return this.props.children;
        }

        const reset = (): void =>
        {
            this.setState({ error: undefined });
        };
        const Fallback = this.props.fallback;

        if (Fallback !== undefined)
        {
            return <Fallback error={this.state.error} plugin={this.props.plugin} reset={reset} />;
        }

        return (
            <p role="alert" data-plugin={this.props.plugin}>
                {`"${this.props.plugin}" failed to render.`}
            </p>
        );
    }
}
