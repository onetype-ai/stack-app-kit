/** Where the viewer's permissions come from. The application owns this. */
export type Source = {
    granted: () => readonly string[];
};

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

        all: (wanted: readonly string[]): boolean =>
        {
            const carries = granted();

            return wanted.every((permission) => carries.has(permission));
        },
    };
}
