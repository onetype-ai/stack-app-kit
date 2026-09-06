import { describe, expect, test } from "vitest";
import { definePlugin } from "../../kernel/api";
import { start } from "../internal/start";


/**
 * The kernel announces a 401 as an event, so a plugin can send the viewer
 * somewhere. An event nothing declares throws when it is emitted, which
 * turned a refused session into a dead boot.
 */
describe("a 401 from the server", () =>
{
    test("reaches a plugin that listens for it", async () =>
    {
        const heard: unknown[] = [];

        const watcher = definePlugin("watcher", {
            version: "1.0.0",
            describe: "Hears a refused request.",
            dependsOn: ["transport"],
            listens: {
                "transport.unauthorized": {
                    describe: "Somebody was signed out.",
                    handle: (payload: unknown) =>
                    {
                        heard.push(payload);
                    },
                },
            },
        });

        const app = await start({
            plugins: [watcher],
            transport: { baseUrl: "/api" },
        });

        expect(app.kernel.started()).toBe(true);

        await app.stop();
    });

    test("and the event it announces is declared, so emitter it is not a fault", async () =>
    {
        const app = await start({ plugins: [], transport: { baseUrl: "/api" } });

        const emitter = (): void =>
        {
            app.kernel.context("transport").events.emit("transport.unauthorized", { path: "/session" });
        };

        expect(emitter).not.toThrow();

        await app.stop();
    });
});
