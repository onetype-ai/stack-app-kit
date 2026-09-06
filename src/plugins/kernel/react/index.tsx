import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type FunctionComponent, type ReactNode } from "react";

import type { Context, FallbackProps, Registered } from "../api";
import type { Kernel } from "../internal/kernel";

export { StartupFailure } from "./StartupFailure";
export type { StartupFailureProps } from "./StartupFailure";

export { useDismiss } from "./hooks/useDismiss";
export { useEventCallback } from "./hooks/useEventCallback";
export { useFocusTrap } from "./hooks/useFocusTrap";

const KernelContext = createContext<Kernel | undefined>(undefined);

/** The pages shown when a viewer may not see something, or nothing matched. */
export type StatusPages = {
    forbidden: ComponentType<{ permission?: string | undefined }>;
    missing: ComponentType<{ path?: string | undefined }>;
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
        throw new Error("useKernel was called outside a KernelProvider.");
    }

    return kernel;
}

/**
 * What a plugin holds: its config, its services, and everything a context
 * carries.
 *
 * Named so a plugin can alias it once: `export type DemoHandle =
 * PluginHandle<DemoConfig, DemoServices>`: rather than spelling the pair at
 * every call site.
 */
export type PluginHandle<Config = unknown, Services = unknown> = Context<Config, Services>;

/** One plugin's context and services, by name. */
export function usePlugin<Config = unknown, Services = unknown>(name: string): PluginHandle<Config, Services>
{
    return useKernel().context(name) as PluginHandle<Config, Services>;
}

/**
 * Hears an event for as long as this component is on screen.
 *
 * `handle` is held in a ref, so a component may pass a new closure on every
 * render without the subscription being torn down and rebuilt. What decides
 * that is `plugin` and `event`, and nothing else.
 */
export function useEvent(plugin: string, event: string, handle: (payload: unknown) => void): void
{
    const kernel = useKernel();
    const latest = useRef(handle);

    latest.current = handle;

    useEffect(() =>
    {
        return kernel.context(plugin).events.on(event, (payload) =>
        {
            latest.current(payload);
        });
    }, [kernel, plugin, event]);
}

/**
 * Reads a value a service keeps, and re-renders when it changes.
 *
 * `watch` takes a callback and answers what stops it, which is the shape a
 * service already has when it keeps anything. `read` answers the value now.
 *
 * Both are held in refs, so a component may pass new closures on every render
 * without resubscribing. Pass a stable `read` or memoise what it answers: a
 * new object each call makes React re-render forever.
 */
export function useStore<Value>(
    watch: (told: () => void) => () => void,
    read: () => Value,
): Value
{
    const latestWatch = useRef(watch);
    const latestRead = useRef(read);

    latestWatch.current = watch;
    latestRead.current = read;

    const subscribe = useCallback((told: () => void) =>
    {
        return latestWatch.current(told);
    }, []);

    const snapshot = useCallback(() =>
    {
        return latestRead.current();
    }, []);

    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Renders every contribution to a slot.
 *
 * Each gets the validated payload, because a contribution that cannot learn
 * what it decorates is the mechanism missed. Each renders behind its own
 * boundary, so one throwing does not blank the rest.
 */
export function Slot({ name, payload }: { name: string; payload?: unknown }): ReactNode
{
    const kernel = useKernel();
    const { contributions, problem } = kernel.slot(name, payload);

    if (problem !== undefined)
    {
        return <FailedSlot name={name} problem={problem} />;
    }

    return (
        <>
            {contributions
                .filter((contribution) => kernel.permissions.all(contribution.requires ?? []))
                .map((contribution) => (
                    <Boundary
                        key={`${contribution.plugin}:${contribution.slot}:${contribution.order ?? 0}`}
                        plugin={contribution.plugin}
                        fallback={kernel.fallbackFor(contribution.plugin)}
                    >
                        <contribution.render payload={payload} />
                    </Boundary>
                ))}
        </>
    );
}

/** A page, and what it takes to see it. */
export function RouteGuard({ route, send }: { route: Registered; send?: (to: string) => ReactNode }): ReactNode
{
    const kernel = useKernel();
    const pages = usePages();

    const lacking = (route.requires ?? []).filter((permission) => !kernel.permissions.has(permission));

    if (lacking.length > 0)
    {
        return <pages.forbidden permission={lacking[0]} />;
    }

    const elsewhere = route.instead?.(kernel.context(route.plugin));

    if (elsewhere !== undefined)
    {
        return send === undefined ? null : send(elsewhere);
    }

    if (route.title !== undefined && typeof document !== "undefined")
    {
        document.title = route.title;
    }

    return (
        <Boundary plugin={route.plugin} fallback={route.fallback}>
            <route.component />
        </Boundary>
    );
}

/**
 * The 404, for a path nothing declared.
 *
 * Takes no props: a router renders it with whatever shape that router uses,
 * and a component demanding its own would not typecheck against any of them.
 */
export function NotFound(): ReactNode
{
    const pages = usePages();

    return <pages.missing />;
}

/**
 * The frame every page renders inside, from whichever plugin owns it.
 *
 * A component rather than a wrapper: the frame renders the router's outlet
 * itself, so what goes inside is the router's business and not ours. An
 * application naming its own frame would be naming a plugin, which is the
 * thing the kernel exists to prevent.
 */
export function useFrame(): FunctionComponent
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

/**
 * Contains a failure to one region.
 *
 * The previous build logged through a logger no caller could pass, so every
 * render crash was swallowed while the docs promised it was recorded. This
 * one renders what it caught, which is visible without any wiring at all.
 */
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
