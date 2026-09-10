import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type ImportEdge = {
    from: string;
    to: string;
    specifier: string;
};

export type ImportViolation = {
    rule: "undeclared" | "deep" | "cycle" | "contract" | "twice";
    message: string;
};

type PluginImports = {
    name: string;
    declared: Set<string>;
    crossings: ImportEdge[];
};

export function findImportViolations(root: string): ImportViolation[]
{
    const names = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    const contracts = names.filter((name) => existsSync(join(root, name, "plugin.ts")));

    const missing = names
        .filter((name) => !contracts.includes(name))
        .map((name) => ({
            rule: "contract" as const,
            message: `"${name}" is a plugin folder with no plugin.ts. Add its contract, or remove the folder.`,
        }));

    const plugins = contracts.map((name) => read(root, name, contracts));

    return [...missing, ...undeclared(plugins), ...deep(plugins), ...findCycles(plugins)];
}

function read(root: string, name: string, names: readonly string[]): PluginImports
{
    const others = new Set(names.filter((other) => other !== name));
    const contract = readFileSync(join(root, name, "plugin.ts"), "utf8");
    const match = /dependsOn:\s*\[([^\]]*)\]/.exec(contract);

    return {
        name,
        declared: new Set(match === null ? [] : [...match[1]!.matchAll(/"([^"]+)"/g)].map((quoted) => quoted[1]!)),
        crossings: files(root, name).flatMap(({ path, source }) => crossings(name, path, source, others)),
    };
}

function files(root: string, name: string): { path: string; source: string }[]
{
    const pluginFolder = join(root, name);

    return readdirSync(pluginFolder, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .filter((entry) => !`${entry.parentPath}/`.includes(`${sep}tests${sep}`))
        .map((entry) =>
        {
            const path = join(entry.parentPath, entry.name);

            return { path: path.replace(`${pluginFolder}/`, ""), source: readFileSync(path, "utf8") };
        });
}

const IMPORTS = [
    /(?:^|\s)(?:import|export)(?:\s+type)?\s[^;]*?from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|\s)import\s+["']([^"']+)["']/g,
];

function crossings(name: string, path: string, source: string, others: ReadonlySet<string>): ImportEdge[]
{
    return IMPORTS.flatMap((pattern) => [...source.matchAll(pattern)]).flatMap((match) =>
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

function undeclared(plugins: readonly PluginImports[]): ImportViolation[]
{
    return plugins.flatMap((plugin) =>
        plugin.crossings
            .filter((crossing) => !plugin.declared.has(crossing.to))
            .map((crossing) => ({
                rule: "undeclared" as const,
                message: `${plugin.name}/${crossing.from} imports "${crossing.specifier}" without declaring "${crossing.to}" in dependsOn.`,
            })),
    );
}

function deep(plugins: readonly PluginImports[]): ImportViolation[]
{
    return plugins.flatMap((plugin) =>
        plugin.crossings
            .filter((crossing) => crossing.specifier !== `@plugins/${crossing.to}`)
            .map((crossing) => ({
                rule: "deep" as const,
                message: `${plugin.name}/${crossing.from} reaches "${crossing.specifier}" instead of "@plugins/${crossing.to}".`,
            })),
    );
}

function findCycles(plugins: readonly PluginImports[]): ImportViolation[]
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

    for (const plugin of plugins)
    {
        walk(plugin.name, []);
    }

    return wrong;
}

export type DuplicateSignature = {
    signature: string;
    plugins: readonly string[];
    files: readonly string[];
};

/** A util two plugins wrote for themselves, matched by name and signature. */
export function findSharedNames(root: string): DuplicateSignature[]
{
    const owners = new Map<string, { plugins: Set<string>; files: string[] }>();

    for (const plugin of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()))
    {
        const utilsFolder = join(root, plugin.name, "utils");

        if (!existsSync(utilsFolder))
        {
            continue;
        }

        for (const entry of readdirSync(utilsFolder, { withFileTypes: true, recursive: true }))
        {
            if (!entry.isFile() || !/\.tsx?$/.test(entry.name))
            {
                continue;
            }

            const path = join(entry.parentPath, entry.name);

            for (const method of readFileSync(path, "utf8").matchAll(/^ {4}(?:readonly )?([a-zA-Z][a-zA-Z0-9]*)(\([^)]*\)\s*:\s*[^\n{]+)/gm))
            {
                const signature = `${method[1]!}${method[2]!.replace(/\s+/g, " ").trim()}`;
                const held = owners.get(signature) ?? { plugins: new Set<string>(), files: [] };

                held.plugins.add(plugin.name);
                held.files.push(relative(root, path));
                owners.set(signature, held);
            }
        }
    }

    return [...owners]
        .filter(([, held]) => held.plugins.size > 1)
        .map(([signature, held]) => ({ signature, plugins: [...held.plugins].sort(), files: held.files }));
}

export type SplitVocabulary = {
    name: string;
    plugins: readonly string[];
    files: readonly string[];
    shared: readonly string[];
    apart: readonly string[];
};

export function findSplitVocabulary(root: string): SplitVocabulary[]
{
    const byName = new Map<string, { plugin: string; file: string; values: string[] }[]>();

    for (const plugin of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()))
    {
        for (const entry of readdirSync(join(root, plugin.name), { withFileTypes: true, recursive: true }))
        {
            if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || entry.parentPath.includes("tests"))
            {
                continue;
            }

            const path = join(entry.parentPath, entry.name);

            for (const match of readFileSync(path, "utf8").matchAll(/(?:export )?const (\w+) = z\.enum\(\[([^\]]*)\]/g))
            {
                const values = [...(match[2] ?? "").matchAll(/"([^"]+)"/g)].map((one) => one[1] ?? "").sort();
                const held = byName.get(match[1] ?? "") ?? [];

                held.push({ plugin: plugin.name, file: relative(root, path), values });
                byName.set(match[1] ?? "", held);
            }
        }
    }

    return [...byName].flatMap(([name, held]) => compare(root, name, held));
}

function compare(root: string, name: string, held: { plugin: string; file: string; values: string[] }[]): SplitVocabulary[]
{
    const split: SplitVocabulary[] = [];

    for (let index = 0; index < held.length; index += 1)
    {
        for (let two = index + 1; two < held.length; two += 1)
        {
            const first = held[index]!;
            const second = held[two]!;

            if (first.plugin === second.plugin)
            {
                continue;
            }

            const inBoth = first.values.filter((value) => second.values.includes(value));
            const apart = [
                ...first.values.filter((value) => !second.values.includes(value)),
                ...second.values.filter((value) => !first.values.includes(value)),
            ];

            if (inBoth.length === 0 || (apart.length > 0 && !reaches(root, first.plugin, second.plugin)))
            {
                continue;
            }

            split.push({
                name,
                plugins: [first.plugin, second.plugin],
                files: [first.file, second.file],
                shared: inBoth,
                apart,
            });
        }
    }

    return split;
}

/** One vocabulary two plugins each wrote out, matched by name and by members. */
export function findSharedVocabulary(root: string): DuplicateSignature[]
{
    const owners = new Map<string, { plugins: Set<string>; files: string[] }>();

    for (const plugin of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()))
    {
        const pluginFolder = join(root, plugin.name);

        for (const entry of readdirSync(pluginFolder, { withFileTypes: true, recursive: true }))
        {
            if (!entry.isFile() || !/\.tsx?$/.test(entry.name))
            {
                continue;
            }

            const path = join(entry.parentPath, entry.name);

            for (const declared of readFileSync(path, "utf8").matchAll(/export const ([A-Z][A-Za-z0-9]*) = z\.enum\(\[([^\]]*)\]\)/g))
            {
                const members = [...declared[2]!.matchAll(/"([^"]+)"/g)].map((one) => one[1]!).sort();

                if (members.length === 0)
                {
                    continue;
                }

                const signature = `${declared[1]!} = [${members.join(", ")}]`;
                const held = owners.get(signature) ?? { plugins: new Set<string>(), files: [] };

                held.plugins.add(plugin.name);
                held.files.push(relative(root, path));
                owners.set(signature, held);
            }
        }
    }

    return [...owners]
        .filter(([, held]) => held.plugins.size > 1)
        .map(([signature, held]) => ({ signature, plugins: [...held.plugins].sort(), files: held.files }));
}

export type ShadowedExport = {
    plugin: string;
    component: string;
    owner: string;
    file: string;
};

/** A component a plugin wrote for itself, where one it depends on exports the same name. */
export function findShadowedExports(root: string): ShadowedExport[]
{
    const names = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const exported = new Map<string, Set<string>>();

    for (const name of names)
    {
        const index = join(root, name, "index.ts");

        if (!existsSync(index))
        {
            continue;
        }

        const held = new Set<string>();

        for (const block of readFileSync(index, "utf8").matchAll(/export\s*\{([^}]*)\}/g))
        {
            for (const raw of (block[1] ?? "").split(","))
            {
                const leaving = raw.trim().split(/\s+as\s+/).pop()?.trim() ?? "";

                if (leaving !== "" && !leaving.startsWith("type "))
                {
                    held.add(leaving);
                }
            }
        }

        exported.set(name, held);
    }

    const shadowed: ShadowedExport[] = [];

    for (const name of names)
    {
        const contract = join(root, name, "plugin.ts");
        const components = join(root, name, "components");

        if (!existsSync(contract) || !existsSync(components))
        {
            continue;
        }

        const declared = (/dependsOn:\s*\[([^\]]*)\]/.exec(readFileSync(contract, "utf8"))?.[1] ?? "")
            .split(",")
            .map((one) => one.trim().replace(/["']/g, ""))
            .filter((one) => one !== "");

        for (const entry of readdirSync(components, { withFileTypes: true }))
        {
            if (!entry.isDirectory())
            {
                continue;
            }

            for (const owner of declared)
            {
                if (exported.get(owner)?.has(entry.name) === true)
                {
                    shadowed.push({ plugin: name, component: entry.name, owner, file: `${name}/components/${entry.name}` });
                }
            }
        }
    }

    return shadowed;
}

function reaches(root: string, one: string, two: string): boolean
{
    return dependsOn(root, one, two) || dependsOn(root, two, one);
}

function dependsOn(root: string, from: string, on: string): boolean
{
    const contract = join(root, from, "plugin.ts");

    if (!existsSync(contract))
    {
        return false;
    }

    const declared = /dependsOn\s*:\s*\[([^\]]*)\]/.exec(readFileSync(contract, "utf8"))?.[1] ?? "";

    return declared.includes(`"${on}"`);
}
