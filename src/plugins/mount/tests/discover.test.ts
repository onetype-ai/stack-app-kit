import { describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import { discover } from "../internal/discover";

const made = (name: string) => definePlugin(name, { version: "1.0.0", describe: `The ${name} plugin.` });

describe("discover", () =>
{
    test("sorts by name, so one set is always one order", () =>
    {
        const found = discover({
            "./plugins/shell/plugin.ts": { default: made("shell") },
            "./plugins/auth/plugin.ts": { default: made("auth") },
            "./plugins/demo/plugin.ts": { default: made("demo") },
        });

        expect(found.map((plugin) => plugin.name)).toEqual(["auth", "demo", "shell"]);
    });

    test("refuses a module with no default export, naming the path", () =>
    {
        expect(() => discover({ "./plugins/broken/plugin.ts": {} })).toThrow(
            /\.\/plugins\/broken\/plugin\.ts must default-export/,
        );
    });
});
