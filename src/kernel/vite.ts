import { rules } from "./env";
import { BootFault } from "./errors";

/** What a development server needs to know, before any of it is a Vite option. */
export type ServingOptions = {
    port?: number;
    apiPort?: number;

    /** Where each value is read from, so a caller passes what a bundler loaded. */
    set?: Record<string, string | undefined>;
};

/** The server half of a Vite config: a port of its own, refused when taken, and `/api` reaching the back. */
export type Serving = {
    port: number;
    strictPort: true;
    proxy: Record<string, { target: string; changeOrigin: true; rewrite: (path: string) => string }>;
};

const port = (name: string, fallback: number, set: Record<string, string | undefined>): number =>
{
    const given = set[name];

    try
    {
        return rules.number(name, given === "" ? undefined : given, fallback, 1, 65_535);
    }
    catch
    {
        throw new BootFault("INVALID_ENV", `${name} must be a whole port between 1 and 65535. Received "${String(given)}".`);
    }
};

/**
 * Where an application listens, and which server `/api` reaches.
 *
 * `strictPort` is the point: a port already taken is refused rather than
 * quietly moved to, so two people running their own never share one by
 * accident and wonder whose change they are looking at.
 */
export function serving(options: ServingOptions = {}): Serving
{
    const set = options.set ?? {};

    return {
        port: options.port ?? port("PORT", 7380, set),
        strictPort: true,
        proxy: {
            "/api": {
                target: `http://localhost:${String(options.apiPort ?? port("API_PORT", 7280, set))}`,
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api/, ""),
            },
        },
    };
}
