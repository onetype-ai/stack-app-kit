import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { findLiterals, findUnknownClasses, findUnknownTokens } from "../styling";

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

    test("is reported when nothing does, naming the file and the token", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --ink: #000; }",
            "card.module.css": ".root { padding: var(--space-6); }",
        });

        expect(findUnknownTokens(at)).toEqual([{ file: "card.module.css", token: "--space-6" }]);
    });

    test("and when what declares it holds nothing, which resolves the same way", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --one: ; }",
            "card.module.css": ".root { color: var(--one); }",
        });

        expect(findUnknownTokens(at)).toEqual([{ file: "card.module.css", token: "--one" }]);
    });

    test("however an application spells it, and names the whole of one that is missing", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --oneTwo: 4px; --one_two: 4px; }",
            "card.module.css": ".root { padding: var(--oneTwo); margin: var(--one_two); gap: var(--threeFour); }",
        });

        expect(findUnknownTokens(at)).toEqual([{ file: "card.module.css", token: "--threeFour" }]);
    });

    test("counts one a stylesheet declares for itself", () =>
    {
        const at = folderWith({
            "card.module.css": ".root { --mark: #eee; }\n.body { background: var(--mark); }",
        });

        expect(findUnknownTokens(at)).toEqual([]);
    });

    test("but not one another module declared, which its root never reaches", () =>
    {
        const at = folderWith({
            "tokens.css": ":root { --two: 4px; }",
            "a/a.module.css": ".root { --one: 4px; padding: var(--one); }",
            "b/b.module.css": ".root { padding: var(--one); }",
        });

        expect(findUnknownTokens(at)).toEqual([{ file: "b/b.module.css", token: "--one" }]);
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

    test("and when the module it read sits in another folder", () =>
    {
        const at = folderWith({
            "shared/one.module.css": ".root { color: red; }",
            "b/B.tsx": 'import styles from "../shared/one.module.css";\nexport const B = () => <div className={styles.two} />;',
        });

        expect(findUnknownClasses(at)).toEqual([{ file: "b/B.tsx", name: "two" }]);
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

describe("a raw value written where the values are not declared", () =>
{
    test("is named, whether it is a colour, a length or a duration", () =>
    {
        const at = folderWith({
            "card.module.css": ".root { color: #ff0000; padding: 12px; transition: all 200ms; }",
        });

        expect(findLiterals(at).map((one) => one.kind)).toEqual(["colour", "length", "duration"]);
    });

    test("but not in the sheet that declares them", () =>
    {
        const at = folderWith({ "tokens.css": ":root { --one: #ff0000; --two: 12px; }" });

        expect(findLiterals(at)).toEqual([]);
    });

    test("but not the instant that kills an animation, in any spelling", () =>
    {
        const at = folderWith({
            "reduced.module.css": ".a { animation-duration: 0; }\n.b { animation-duration: 0s; }\n"
                + ".c { transition-duration: 0ms; }\n.d { animation-duration: 1ms; }\n",
        });

        expect(findLiterals(at)).toEqual([]);
    });

    test("and one millisecond longer is a duration again", () =>
    {
        const at = folderWith({ "reduced.module.css": ".a { animation-duration: 2ms; }" });

        expect(findLiterals(at).map((one) => one.kind)).toEqual(["duration"]);
    });

    test("nor in the one that only takes browser defaults away", () =>
    {
        const at = folderWith({ "reset.css": "* { margin: 0; padding: 12px; }" });

        expect(findLiterals(at)).toEqual([]);
    });

    test("nor a breakpoint, which a custom property cannot reach inside", () =>
    {
        const at = folderWith({
            "card.module.css": "@media (max-width: 60rem)\n{\n    .root { color: var(--one); }\n}",
        });

        expect(findLiterals(at)).toEqual([]);
    });

    test("nor nothing, nor the thinnest line a token would not carry", () =>
    {
        const at = folderWith({ "card.module.css": ".root { margin: 0; border-width: 1px; }" });

        expect(findLiterals(at)).toEqual([]);
    });
});
