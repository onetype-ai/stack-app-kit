import type { z } from "zod";

import type { Definition, Plugin } from "./contract";
import * as names from "./names";

/** Declares a plugin. */
export function definePlugin<Schema extends z.ZodType, Services = unknown>(
    name: string,
    definition: Definition<Schema, Services>,
): Plugin
{
    names.plugin(name);

    return { name, definition: definition as unknown as Definition };
}
