import type { ShippedEntry } from "./shipper";

export function postTo(url: string): (entries: readonly ShippedEntry[], isLeaving: boolean) => Promise<number>
{
    return async (entries, isLeaving) =>
    {
        const answer = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            keepalive: isLeaving,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entries }),
        });

        return answer.status;
    };
}
