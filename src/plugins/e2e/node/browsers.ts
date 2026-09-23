import type { Browser, BrowserContext, Page } from "playwright";

import { browserFlags } from "./flags";
import { defaultLockPath, takeLock } from "./lock";

/** What `Browsers.launch` takes: test hostnames that resolve to this machine, certificates to trust by hash, and the lock. */
export type LaunchOptions = {
    hosts?: readonly string[] | undefined;
    trustSpki?: readonly string[] | undefined;

    /** The machine-wide lock one browser run holds at a time; a folder in the temp directory by default. */
    lockPath?: string | undefined;
    lockWaitMs?: number | undefined;
};

/** A page that records what a reader would never see: console errors, uncaught throws and 5xx answers, one sentence each. */
export type WatchedPage = {
    context: BrowserContext;
    page: Page;
    problems: string[];
};

/** A launched browser holding the lock until it closes. */
export type LaunchedBrowser = {
    browser: Browser;
    open: (viewport?: { width: number; height: number }) => Promise<WatchedPage>;
    close: () => Promise<void>;
};

async function watch(browser: Browser, viewport: { width: number; height: number }): Promise<WatchedPage>
{
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const problems: string[] = [];

    page.on("console", (message) =>
    {
        if (message.type() === "error")
        {
            problems.push(`console: ${message.text()}`);
        }
    });
    page.on("pageerror", (error) =>
    {
        problems.push(`threw: ${error.message}`);
    });
    page.on("response", (response) =>
    {
        if (response.status() >= 500)
        {
            problems.push(`server: ${String(response.status())} from ${response.request().method()} ${new URL(response.url()).pathname}`);
        }
    });

    return { context, page, problems };
}

export async function launch(options: LaunchOptions = {}): Promise<LaunchedBrowser>
{
    const args = browserFlags(options.hosts ?? [], options.trustSpki ?? []);
    const release = await takeLock(options.lockPath ?? defaultLockPath, options.lockWaitMs ?? 600_000);

    try
    {
        const { chromium } = await import("playwright");
        const browser = await chromium.launch({ args });

        return {
            browser,
            open: (viewport = { width: 1440, height: 900 }) => watch(browser, viewport),
            close: async () =>
            {
                try
                {
                    await browser.close();
                }
                finally
                {
                    release();
                }
            },
        };
    }
    catch (cause)
    {
        release();

        throw cause;
    }
}
