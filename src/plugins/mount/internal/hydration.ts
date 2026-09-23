import { KernelFault } from "../../kernel/api";

type Hydratable = {
    ssr?: unknown;
    load?: () => Promise<unknown>;
    update?: (options: { history: unknown }) => void;
};

export async function readyToHydrate(router: unknown): Promise<void>
{
    const hydratable = router as Hydratable | undefined;

    if (hydratable === undefined || typeof hydratable.load !== "function")
    {
        return;
    }

    hydratable.ssr = { manifest: undefined };
    await hydratable.load();
}

export async function visit(router: unknown, history: ((path: string) => unknown) | undefined, path: string): Promise<void>
{
    const visitable = router as Hydratable | undefined;

    if (visitable === undefined || history === undefined || typeof visitable.update !== "function" || typeof visitable.load !== "function")
    {
        throw new KernelFault("INVALID_CONFIG", `mount: visiting "${path}" needs a router built with router.history, and a router that can update and load. Give start a router with history: (path) => createMemoryHistory({ initialEntries: [path] }).`);
    }

    visitable.update({ history: history(path) });
    await visitable.load();
}
