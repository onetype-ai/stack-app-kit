import { describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import { discover } from "../internal/discover";

const modules = (name: string) => definePlugin(name, { version: "1.0.0", describe: `The ${name} plugin.` });

describe("discover", () =>
{
    test("sorts by name, so one set is always one order", () =>
    {
        const plugins = discover({
            "./plugins/shell/plugin.ts": { default: modules("shell") },
            "./plugins/auth/plugin.ts": { default: modules("auth") },
            "./plugins/demo/plugin.ts": { default: modules("demo") },
        });

        expect(plugins.map((plugin) => plugin.name)).toEqual(["auth", "demo", "shell"]);
    });

    test("refuses a module with no default export, naming the path", () =>
    {
        expect(() => discover({ "./plugins/broken/plugin.ts": {} })).toThrow(
            /\.\/plugins\/broken\/plugin\.ts must default-export/,
        );
    });
});
