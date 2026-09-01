import type { z } from "zod";

import type { Definition, Plugin } from "./contract";
import * as names from "./names";

/**
 * Declares a plugin.
 *
 * The name is checked here rather than at start, so a typo names itself where
 * it was written instead of in a stack from somewhere else.
 */
export function definePlugin<Schema extends z.ZodType, Made = unknown>(
    name: string,
    definition: Definition<Schema, Made>,
): Plugin
{
    names.plugin(name);

    return { name, definition: definition as unknown as Definition };
}
