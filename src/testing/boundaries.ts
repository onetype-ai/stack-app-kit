import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type ImportEdge = {
    from: string;
    to: string;
    specifier: string;
};

export type ImportViolation = {
    rule: "undeclared" | "deep" | "cycle";
    message: string;
};

type Read = {
    name: string;
    declared: Set<string>;
    crossings: ImportEdge[];
};

export function findImportViolations(root: string): ImportViolation[]
{
    const names = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    const plugins = names.map((name) => read(root, name, names));

    return [...undeclared(plugins), ...deep(plugins), ...cycles(plugins)];
}

function read(root: string, name: string, names: readonly string[]): Read
{
    const others = new Set(names.filter((other) => other !== name));
    const contract = readFileSync(join(root, name, "plugin.ts"), "utf8");
    const match = /dependsOn:\s*\[([^\]]*)\]/.exec(contract);

    return {
        name,
        declared: new Set(match === null ? [] : [...match[1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!)),
        crossings: files(root, name).flatMap(({ path, source }) => crossings(name, path, source, others)),
    };
}

function files(root: string, name: string): { path: string; source: string }[]
{
    const at = join(root, name);

    return readdirSync(at, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) =>
        {
            const path = join(entry.parentPath, entry.name);

            return { path: path.replace(`${at}/`, ""), source: readFileSync(path, "utf8") };
        });
}

// A specifier is resolved against the file that wrote it rather than matched as
// text: "../../other/thing" reaches the same private file an alias would, and a
// rule reading the alias alone calls that clean.
function crossings(name: string, path: string, source: string, others: ReadonlySet<string>): ImportEdge[]
{
    return [...source.matchAll(/from\s+"([^"]+)"/g)].flatMap((match) =>
    {
        const specifier = match[1]!;
        const alias = /^@plugins\/([^/]+)/.exec(specifier);

        if (alias !== null && others.has(alias[1]!))
        {
            return [{ from: path, to: alias[1]!, specifier }];
        }

        if (!specifier.startsWith("."))
        {
            return [];
        }

        const parts = [name, ...path.split("/").slice(0, -1), ...specifier.split("/")];
        const walked: string[] = [];

        for (const part of parts)
        {
            if (part === "..")
            {
                walked.pop();
            }
            else if (part !== ".")
            {
                walked.push(part);
            }
        }

        const target = walked[0];

        return target !== undefined && others.has(target) ? [{ from: path, to: target, specifier }] : [];
    });
}

function undeclared(plugins: readonly Read[]): ImportViolation[]
{
    return plugins.flatMap((one) =>
        one.crossings
            .filter((crossing) => !one.declared.has(crossing.to))
            .map((crossing) => ({
                rule: "undeclared" as const,
                message: `${one.name}/${crossing.from} imports "${crossing.specifier}" without declaring "${crossing.to}" in dependsOn.`,
            })),
    );
}

function deep(plugins: readonly Read[]): ImportViolation[]
{
    return plugins.flatMap((one) =>
        one.crossings
            .filter((crossing) => crossing.specifier !== `@plugins/${crossing.to}`)
            .map((crossing) => ({
                rule: "deep" as const,
                message: `${one.name}/${crossing.from} reaches "${crossing.specifier}" instead of "@plugins/${crossing.to}".`,
            })),
    );
}

function cycles(plugins: readonly Read[]): ImportViolation[]
{
    const edges = new Map(plugins.map((plugin) => [plugin.name, new Set(plugin.crossings.map((crossing) => crossing.to))]));
    const wrong: ImportViolation[] = [];
    const walking = new Set<string>();
    const done = new Set<string>();

    function walk(name: string, trail: readonly string[]): void
    {
        if (done.has(name))
        {
            return;
        }

        if (walking.has(name))
        {
            wrong.push({
                rule: "cycle",
                message: `Plugins import each other in a loop: ${[...trail.slice(trail.indexOf(name)), name].join(" -> ")}.`,
            });

            return;
        }

        walking.add(name);

        for (const target of edges.get(name) ?? [])
        {
            walk(target, [...trail, name]);
        }

        walking.delete(name);
        done.add(name);
    }

    for (const one of plugins)
    {
        walk(one.name, []);
    }

    return wrong;
}
