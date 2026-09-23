type Hydratable = {
    ssr?: unknown;
    load?: () => Promise<unknown>;
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
