import { configure, forget, closeOver } from "../kernel/closure";
import type { Plugin } from "../index";

/** A plugin a test did not name, and the config it boots with; config is only ever given to a plugin the closure added. */
export type FoundPlugin = {
    plugin: Plugin;
    config?: unknown;
};

/** Where the plugins a test did not name come from. `resolve` runs once per name, only for one nothing given provides. */
export type TestKernels = {
    resolve: (name: string) => FoundPlugin | undefined | Promise<FoundPlugin | undefined>;
};

/**
 * Set once per test process (a setup file). From then on `start` adds every plugin the given ones depend on,
 * transitively: a plugin the test passed wins by name, so a stand-in stays one, dependencies come first, and
 * otherwise the given order holds. A name nothing provides is still refused as UNKNOWN_DEPENDENCY.
 * Never called, `start` boots exactly what it was given. Only `./testing` exports it.
 */
export function configureTestKernels(fixture: TestKernels): void
{
    configure(fixture);
}

/** Forgets what `configureTestKernels` set, so `start` boots exactly what it is given again. */
export function resetTestKernels(): void
{
    forget();
}

/** The same closure over dependsOn, for a test building its kernel with `createKernel` rather than `start`. */
export async function withDependencies(plugins: readonly Plugin[]): Promise<readonly Plugin[]>
{
    return (await closeOver(plugins, undefined)).plugins as readonly Plugin[];
}
