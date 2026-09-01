/** An answer to a request we sent. */
export type Answer = { id: string; status: number; body: unknown };

/** Something the server pushed, on a channel someone subscribed to. */
export type Push = { channel: string; message: unknown };

/**
 * Reads one frame off the socket.
 *
 * Nothing the server sends is trusted: every field is checked before it
 * reaches a caller, and a frame that does not fit either shape is undefined
 * rather than a half-built object.
 */
export function frame(raw: unknown): Answer | Push | undefined
{
    if (typeof raw !== "string")
    {
        return undefined;
    }

    let parsed: unknown;

    try
    {
        parsed = JSON.parse(raw);
    }
    catch
    {
        return undefined;
    }

    if (typeof parsed !== "object" || parsed === null)
    {
        return undefined;
    }

    const envelope = parsed as { id?: unknown; status?: unknown; body?: unknown; channel?: unknown };

    if (typeof envelope.id === "string" && typeof envelope.status === "number")
    {
        return { id: envelope.id, status: envelope.status, body: envelope.body };
    }

    if (typeof envelope.channel === "string")
    {
        return { channel: envelope.channel, message: envelope.body };
    }

    return undefined;
}
