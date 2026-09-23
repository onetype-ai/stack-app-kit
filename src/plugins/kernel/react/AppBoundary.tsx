import { Component } from "react";
import type { ComponentType, CSSProperties, ErrorInfo, ReactNode } from "react";

/** What the page an `AppBoundary` falls back to receives. */
export type AppFailureProps = {
    error: unknown;
    reset: () => void;
};

/** Around the whole application: whatever throws above a plugin's own boundary is shown and reported, never a blank page. */
export type AppBoundaryProps = {
    children: ReactNode;

    /** Reports what was caught, e.g. `(error) => log.error("render failed", { error })`, since no window error event fires for it. */
    onError?: ((error: unknown, info: { componentStack?: string | null | undefined }) => void) | undefined;

    /** The page shown instead; a plain one with a retry when left out. */
    fallback?: ComponentType<AppFailureProps> | undefined;
};

type AppBoundaryState = { error: unknown; failed: boolean };

function PlainFailure({ reset }: AppFailureProps): ReactNode
{
    return (
        <div role="alert" style={root}>
            <h1 style={title}>Something went wrong</h1>
            <p style={text}>The page could not be shown. Trying again usually helps.</p>
            <button type="button" onClick={reset}>Try again</button>
        </div>
    );
}

/** Catches what no plugin's boundary did, reports it once, and shows a page with a way back. */
export class AppBoundary extends Component<AppBoundaryProps, AppBoundaryState>
{
    override state: AppBoundaryState = { error: undefined, failed: false };

    static getDerivedStateFromError(error: unknown): AppBoundaryState
    {
        return { error, failed: true };
    }

    override componentDidCatch(error: unknown, info: ErrorInfo): void
    {
        this.props.onError?.(error, { componentStack: info.componentStack });
    }

    override render(): ReactNode
    {
        if (!this.state.failed)
        {
            return this.props.children;
        }

        const Failure = this.props.fallback ?? PlainFailure;
        const reset = (): void =>
        {
            this.setState({ error: undefined, failed: false });
        };

        return <Failure error={this.state.error} reset={reset} />;
    }
}

const root: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1rem",
    maxWidth: "60ch",
    margin: "0 auto",
    padding: "3rem 1.25rem",
    fontFamily: "system-ui, sans-serif",
};

const title: CSSProperties = { fontSize: "1.5rem", fontWeight: 600, margin: 0 };

const text: CSSProperties = { margin: 0, lineHeight: 1.5 };
