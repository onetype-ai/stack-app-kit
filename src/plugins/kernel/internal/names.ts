import { KernelFault } from "./faults";

const PLUGIN = /^[a-z][a-z0-9-]{0,63}$/;

const NAMESPACED = /^[a-z][a-z0-9-]{0,63}(\.[a-z][a-z0-9-]{0,63})+$/;

/**
 * Names the character that broke a name, so an author sees the typo rather
 * than a regular expression.
 */
function describe(value: string): string
{
    const at = [...value].findIndex((character) => !/[a-z0-9.-]/.test(character));

    return at === -1 ? `"${value}"` : `"${value}" (unsupported character at position ${at + 1}: "${value[at]}")`;
}

/** A plugin name: lowercase, digits and hyphens, starting with a letter. */
export function plugin(value: string): string
{
    if (!PLUGIN.test(value))
    {
        throw new KernelFault(
            "INVALID_NAME",
            `A plugin name is lowercase letters, digits and hyphens, starting with a letter, up to 64 characters. Received ${describe(value)}.`,
            { detail: { received: value } },
        );
    }

    return value;
}

/**
 * A namespaced name, owned by the plugin its first segment names.
 *
 * The prefix is what makes a name enough: a listener on "auth.signed-out"
 * knows who owns it without a lookup, and two plugins cannot claim one name.
 */
export function namespaced(value: string, kind: string, ownedBy: string): string
{
    if (!NAMESPACED.test(value))
    {
        throw new KernelFault(
            "INVALID_NAME",
            `A ${kind} name is dot-separated lowercase segments, such as "${ownedBy}.thing". Received ${describe(value)}.`,
            { plugin: ownedBy, detail: { received: value, kind } },
        );
    }

    if (!value.startsWith(`${ownedBy}.`))
    {
        throw new KernelFault(
            "INVALID_NAME",
            `A ${kind} is named inside its own ownedBy: "${value}" belongs to "${value.split(".")[0] ?? ""}", not to "${ownedBy}". Rename it to "${ownedBy}.${value.split(".").slice(1).join(".")}".`,
            { plugin: ownedBy, detail: { received: value, kind, ownedBy } },
        );
    }

    return value;
}

/** Who owns a namespaced name. */
export function owner(value: string): string
{
    return value.split(".")[0] ?? "";
}
