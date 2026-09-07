export type Answer = { id: string; status: number; body: unknown };

export type Push = { channel: string; message: unknown };

export function frame(text: unknown): Answer | Push | undefined
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

    const envelope = decoded as { id?: unknown; status?: unknown; body?: unknown; channel?: unknown };

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
