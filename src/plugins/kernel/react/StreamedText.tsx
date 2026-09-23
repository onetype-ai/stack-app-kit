import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/** Text that grows while it streams: shown as it arrives, announced once when it completes; text that never streamed is not announced. */
export type StreamedTextProps = {
    text: string;

    /** True while more text may arrive: the text is marked busy, and nothing is announced yet. */
    streaming: boolean;

    /** What a screen reader hears before the text, e.g. the author's name. */
    label?: string | undefined;
    className?: string | undefined;
};

/** Shows streamed text as it grows, and announces it through a polite live region once, when it stops growing. */
export function StreamedText({ text, streaming, label, className }: StreamedTextProps): ReactNode
{
    const [announced, setAnnounced] = useState("");
    const wasStreaming = useRef(streaming);

    useEffect(() =>
    {
        if (wasStreaming.current && !streaming)
        {
            setAnnounced(label === undefined ? text : `${label}: ${text}`);
        }

        wasStreaming.current = streaming;
    }, [streaming, text, label]);

    return (
        <>
            <div className={className} aria-busy={streaming}>{text}</div>
            <div role="status" aria-live="polite" aria-atomic="true" style={offscreen}>{streaming ? "" : announced}</div>
        </>
    );
}

const offscreen: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
};
