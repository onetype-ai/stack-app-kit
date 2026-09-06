import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { findUnknownClasses, findUnknownTokens } from "../styling";

/** A folder holding exactly the files a case needs. */
function folderWith(files: Record<string, string>): string
{
    const at = mkdtempSync(join(tmpdir(), "styling-"));

    for (const [name, body] of Object.entries(files))
    {
        const path = join(at, name);

        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, body);
    }

    return at;
}

describe("a token a stylesheet asks for", () =>
{
    test("passes when something declares it", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --ink: #000; }",
            "card.module.css": ".root { color: var(--ink); }",
        });

        expect(findUnknownTokens(at)).toEqual([]);
    });

    /**
     * The one this exists for. CSS resolves an undeclared token to nothing
     * and drops the rule, so the build is green and the page is unstyled.
     */
    test("is reported when nothing does, naming the file and the token", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --ink: #000; }",
            "card.module.css": ".root { padding: var(--space-6); }",
        });

        expect(findUnknownTokens(at)).toEqual([{ file: "card.module.css", token: "--space-6" }]);
    });

    test("counts one a stylesheet declares for itself", () =>
    {
        const at = folderWith({
            "card.module.css": ".root { --mark: #eee; }\n.body { background: var(--mark); }",
        });

        expect(findUnknownTokens(at)).toEqual([]);
    });

    test("and one a component hands in through style", () =>
    {
        const at = folderWith({
            "Avatar.module.css": ".root { color: oklch(0.4 0.1 calc(var(--seed) * 1deg)); }",
            "Avatar.tsx": 'const style = { "--seed": "120" };',
        });

        expect(findUnknownTokens(at)).toEqual([]);
    });

    test("reads every stylesheet, however deep", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --ink: #000; }",
            "components/Deep/Deep.module.css": ".root { color: var(--gone); }",
        });

        expect(findUnknownTokens(at).map((unknown) => unknown.token)).toEqual(["--gone"]);
    });
});

describe("a class a component reads", () =>
{
    test("is named when its own module never declared it", () =>
    {
        const at = folderWith({
            "Card.module.css": ".root { color: red; }\n",
            "Card.tsx": 'export const Card = () => <p className={styles.head} />;\n',
        });

        expect(findUnknownClasses(at)).toEqual([{ file: "Card.tsx", name: "head" }]);
    });

    test("and says nothing when every one is declared", () =>
    {
        const at = folderWith({
            "Card.module.css": ".root { color: red; }\n.head { font-weight: 700; }\n",
            "Card.tsx": 'export const Card = () => <p className={styles.head} />;\n',
        });

        expect(findUnknownClasses(at)).toEqual([]);
    });
});
