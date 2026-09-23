export type FrameReply = { id: string; status: number; body: unknown };

export type Push = { channel: string; message: unknown };

export type Subscribed = { channel: string; subscribed: true };

export type Refused = { channel: string; refused: string };

export type Control =
    | { control: "ping" }
    | { control: "ready"; connection: string | undefined }
    | { control: "backoff"; ms: number };

export type Frame = FrameReply | Push | Subscribed | Refused | Control;

const longestBackoffMs = 300_000;

function controlOf(channel: string, envelope: { ms?: unknown; connection?: unknown }): Control | undefined
{
    if (channel === "$ping")
    {
        return { control: "ping" };
    }

    if (channel === "$ready")
    {
        return { control: "ready", connection: typeof envelope.connection === "string" ? envelope.connection : undefined };
    }

    if (channel === "$backoff" && typeof envelope.ms === "number" && Number.isFinite(envelope.ms) && envelope.ms >= 0)
    {
        return { control: "backoff", ms: Math.min(envelope.ms, longestBackoffMs) };
    }

    return undefined;
}

export function frame(text: unknown): Frame | undefined
{
    if (typeof text !== "string")
    {
        return undefined;
    }

    let decoded: unknown;

    try
    {
        decoded = JSON.parse(text);
    }
    catch
    {
        return undefined;
    }

    if (typeof decoded !== "object" || decoded === null)
    {
        return undefined;
    }

    const envelope = decoded as { id?: unknown; status?: unknown; body?: unknown; channel?: unknown; subscribed?: unknown; error?: unknown; ms?: unknown; connection?: unknown };

    if (typeof envelope.id === "string" && typeof envelope.status === "number")
    {
        return { id: envelope.id, status: envelope.status, body: envelope.body };
    }

    if (typeof envelope.channel !== "string")
    {
        return undefined;
    }

    if (envelope.channel.startsWith("$"))
    {
        return controlOf(envelope.channel, envelope);
    }

    if (envelope.subscribed === true)
    {
        return { channel: envelope.channel, subscribed: true };
    }

    if (typeof envelope.error === "object" && envelope.error !== null)
    {
        const code = (envelope.error as { code?: unknown }).code;

        return { channel: envelope.channel, refused: typeof code === "string" ? code : "CHANNEL_REFUSED" };
    }

    return { channel: envelope.channel, message: envelope.body };
}
