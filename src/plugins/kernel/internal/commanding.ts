import type { Command, Context } from "./contract";
import { KernelFault } from "./faults";
import type { permissions } from "./permissions";

// Commands by name, and running one: declared, permitted and its input valid, or refused naming which.
export function commandsTable(permits: ReturnType<typeof permissions>, isRunning: () => boolean)
{
    const commands = new Map<string, {
        plugin: string;
        requires: readonly string[];
        run: (input: unknown, ctx: Context) => void | Promise<void>;
        schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } };
    }>();

    async function run(command: string, input: unknown, contextOf: (plugin: string) => Context): Promise<void>
    {
        if (!isRunning())
        {
            throw new KernelFault(
                "NOT_STARTED",
                `Command "${command}" was run before the kernel started. Every plugin's setup runs first, so a command called from one is too early: reach the service directly instead.`,
            );
        }

        const declared = commands.get(command);

        if (declared === undefined)
        {
            throw new KernelFault("UNDECLARED_COMMAND", `Command "${command}" is not declared by any plugin.`);
        }

        const lacking = declared.requires.filter((permission) => !permits.has(permission));

        if (lacking.length > 0)
        {
            throw new KernelFault(
                "PERMISSION_DENIED",
                `Command "${command}" needs ${lacking.map((permission) => `"${permission}"`).join(", ")}, which the viewer does not have. This is a UI guard, not authorization: the server must refuse it too.`,
                { plugin: declared.plugin, detail: { lacking } },
            );
        }

        const answer = declared.schema.safeParse(input);

        if (!answer.success)
        {
            throw new KernelFault(
                "INVALID_PAYLOAD",
                `The input for "${command}" does not match its schema: ${answer.error?.issues[0]?.message ?? "it was rejected"}.`,
                { plugin: declared.plugin },
            );
        }

        await declared.run(answer.data, contextOf(declared.plugin));
    }

    return {
        declare: (plugin: string, key: string, command: Command<Context>): void =>
        {
            commands.set(key, { plugin, requires: command.requires ?? [], run: command.run, schema: command.schema });
        },

        clear: (): void =>
        {
            commands.clear();
        },

        run,
    };
}
