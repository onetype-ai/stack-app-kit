/** Where the viewer's permissions come from. The application owns this. */
export type PermissionSource = {
    granted: () => readonly string[];
};

export function permissions(source: PermissionSource | undefined)
{
    const granted = (): Set<string> =>
    {
        return new Set(source?.granted() ?? []);
    };

    const watching = new Set<() => void>();

    return {
        has: (permission: string): boolean =>
        {
            return granted().has(permission);
        },

        all: (wanted: readonly string[]): boolean =>
        {
            const carries = granted();

            return wanted.every((permission) => carries.has(permission));
        },

        changed: (): void =>
        {
            for (const notify of watching)
            {
                notify();
            }
        },

        watch: (notify: () => void): (() => void) =>
        {
            watching.add(notify);

            return () =>
            {
                watching.delete(notify);
            };
        },
    };
}
