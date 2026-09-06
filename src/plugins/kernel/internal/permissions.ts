/** Where the viewer's permissions come from. The application owns this. */
export type Source = {
    granted: () => readonly string[];
};

/**
 * What the viewer may do.
 *
 * Read on every check rather than kept: permissions change when a session
 * changes, and a cached list would answer for the previous user.
 */
export function permissions(source: Source | undefined)
{
    const granted = (): Set<string> =>
    {
        return new Set(source?.granted() ?? []);
    };

    return {
        has: (permission: string): boolean =>
        {
            return granted().has(permission);
        },

        all: (permissions: readonly string[]): boolean =>
        {
            const carries = granted();

            return permissions.every((permission) => carries.has(permission));
        },
    };
}
