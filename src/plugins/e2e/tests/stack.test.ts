import { request } from "node:https";
import { createServer } from "node:net";
import { afterEach, describe, expect, test } from "vitest";

import { Browsers, E2eFault, Hosts, Stack } from "../node/index";

const running: (() => Promise<void>)[] = [];

afterEach(async () =>
{
    for (const stop of running.splice(0))
    {
        await stop();
    }
});

function serving(extra = ""): string[]
{
    return ["node", "-e", `require("node:http").createServer((q, s) => { s.end(JSON.stringify({ env: process.env, pid: process.pid })); }).listen(Number(process.env.PORT), "127.0.0.1"); ${extra}`];
}

function isAlive(pid: number): boolean
{
    try
    {
        process.kill(pid, 0);

        return true;
    }
    catch
    {
        return false;
    }
}

describe("a stack", () =>
{
    test("starts every service on its strict port, with only the environment it was given and the run's origins", async () =>
    {
        process.env["DEVELOPER_SECRET"] = "leaked";
        const [apiPort, appPort] = await Stack.freePorts(2);
        const stack = await Stack.start({ services: {
            api: { folder: ".", command: serving(), port: apiPort ?? 0, env: { PORT: String(apiPort), APP_URL: "{app}" } },
            app: { folder: ".", command: serving(), port: appPort ?? 0, env: { PORT: String(appPort), API_URL: "{api}", NODE_ENV: "test" } },
        } });
        running.push(stack.stop);

        const api = await (await fetch(stack.origins["api"] ?? "")).json() as { env: Record<string, string> };
        const app = await (await fetch(stack.origins["app"] ?? "")).json() as { env: Record<string, string> };

        expect(api.env["APP_URL"]).toBe(`http://127.0.0.1:${String(appPort)}`);
        expect(api.env["NODE_ENV"]).toBe("development");
        expect(app.env["NODE_ENV"]).toBe("test");
        expect(app.env["API_URL"]).toBe(`http://127.0.0.1:${String(apiPort)}`);
        expect(api.env["DEVELOPER_SECRET"]).toBeUndefined();
        delete process.env["DEVELOPER_SECRET"];
    });

    test("refuses a port that is taken, naming it, and starts nothing", async () =>
    {
        const [port] = await Stack.freePorts(1);
        const holder = createServer().listen(port, "127.0.0.1");
        await new Promise((resolve) => holder.once("listening", resolve));

        const failed = await Stack.start({ services: { api: { folder: ".", command: serving(), port: port ?? 0 } } }).catch((error: unknown) => error);
        holder.close();

        expect(failed).toBeInstanceOf(E2eFault);
        expect(failed).toMatchObject({ code: "PORT_TAKEN", message: expect.stringContaining(String(port)) });
    });

    test("stops a service by its process group, killing one that ignores SIGTERM once the grace ends", async () =>
    {
        const [port] = await Stack.freePorts(1);
        const stack = await Stack.start({
            services: { api: { folder: ".", command: serving("process.on(\"SIGTERM\", () => {});"), port: port ?? 0, env: { PORT: String(port) } } },
            stopGraceMs: 300,
        });
        const { pid } = await (await fetch(stack.origins["api"] ?? "")).json() as { pid: number };

        await stack.stop();

        expect(pid).toBeGreaterThan(0);
        expect(isAlive(pid)).toBe(false);
    });

    test("refuses a service that never becomes ready, with the tail of its output, and stops what did start", async () =>
    {
        const [first, second] = await Stack.freePorts(2);
        const failed = await Stack.start({
            services: {
                api: { folder: ".", command: serving(), port: first ?? 0, env: { PORT: String(first) } },
                app: { folder: ".", command: ["node", "-e", "console.log('booting the app'); setInterval(() => {}, 1000)"], port: second ?? 0 },
            },
            readyMs: 600,
            stopGraceMs: 300,
        }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ code: "NOT_READY", message: expect.stringContaining("booting the app") });
        await expect(fetch(`http://127.0.0.1:${String(first)}`)).rejects.toThrow();
    });
});

describe("fixture hosts", () =>
{
    test("serve the pages given, and nothing else", async () =>
    {
        const [port] = await Stack.freePorts(1);
        const hosts = await Hosts.start({ pages: { "/": "<p>host</p>" }, port: port ?? 0 });
        running.push(hosts.close);

        expect(await (await fetch(hosts.origin())).text()).toBe("<p>host</p>");
        expect((await fetch(`${hosts.origin()}/other`)).status).toBe(404);
    });

    test("refuse port 443 outside CI, and a hostname that could inject a flag", async () =>
    {
        const saved = process.env["CI"];
        delete process.env["CI"];

        await expect(Hosts.startSecure({ pages: {}, hostnames: ["shop.example.test"] })).rejects.toMatchObject({ code: "NOT_ON_CI" });
        await expect(Hosts.startSecure({ pages: {}, hostnames: ["a.test --no-sandbox"], port: 1 })).rejects.toMatchObject({ code: "UNSAFE_FLAG" });

        if (saved !== undefined)
        {
            process.env["CI"] = saved;
        }
    });

    test("serve over a per-run certificate whose hash they answer", async () =>
    {
        const [port] = await Stack.freePorts(1);
        const hosts = await Hosts.startSecure({ pages: { "/": "<p>secure</p>" }, hostnames: ["shop.example.test"], port: port ?? 0 });
        running.push(hosts.close);

        const body = await new Promise<string>((resolve, fail) =>
        {
            request({ host: "127.0.0.1", port, path: "/", servername: "shop.example.test", rejectUnauthorized: false }, (response) =>
            {
                let text = "";
                response.on("data", (chunk: Buffer) =>
                {
                    text += chunk.toString();
                });
                response.on("end", () => resolve(text));
            }).on("error", fail).end();
        });

        expect(body).toBe("<p>secure</p>");
        expect(hosts.spki).toMatch(/^[A-Za-z0-9+/]{43}=$/);
        expect(hosts.origin()).toBe(`https://shop.example.test:${String(port)}`);
    });
});

describe("launching a browser", () =>
{
    test("refuses a hostname or hash that could inject a flag, before it takes the lock or starts anything", async () =>
    {
        await expect(Browsers.launch({ hosts: ["shop.example.test, MAP * evil.example"], lockPath: "/nonexistent/never-taken" })).rejects.toMatchObject({ code: "UNSAFE_FLAG" });
        await expect(Browsers.launch({ trustSpki: ["not-a-hash"], lockPath: "/nonexistent/never-taken" })).rejects.toMatchObject({ code: "UNSAFE_FLAG" });
    });
});
