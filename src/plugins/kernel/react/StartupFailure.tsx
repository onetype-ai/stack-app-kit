import type { CSSProperties, ReactNode } from "react";

export type StartupFailureProps = {
    message: string;
};

/**
 * What a refused start looks like.
 *
 * The kernel's message names the plugin, the key and the fix, and it is the
 * most useful text in the system. The build before this one threw it into a
 * console behind a blank white page, so it reached nobody.
 *
 * Styles are inline rather than a stylesheet: this renders when startup
 * failed, which is exactly when a stylesheet may not have loaded, and it
 * must not depend on tokens the application defines.
 */
export function StartupFailure({ message }: StartupFailureProps): ReactNode
{
    return (
        <div role="alert" style={root}>
            <h1 style={title}>The application could not start</h1>
            <pre style={body}>{message}</pre>
            <p style={hint}>
                This is a configuration problem, not something you did. Reloading will not change it.
            </p>
        </div>
    );
}

const root: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    maxWidth: "70ch",
    margin: "0 auto",
    padding: "3rem 1.25rem",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
};

const title: CSSProperties = {
    fontSize: "1.5rem",
    fontWeight: 600,
    lineHeight: 1.3,
    margin: 0,
};

const body: CSSProperties = {
    padding: "1rem",
    margin: 0,
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.875rem",
    color: "#b00020",
    background: "#fafafa",
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
};

const hint: CSSProperties = {
    fontSize: "0.875rem",
    color: "#666",
    margin: 0,
};
