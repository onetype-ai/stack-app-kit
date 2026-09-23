import { createServer } from "node:net";

import { E2eFault } from "./faults";

function listens(port: number): Promise<boolean>
{
    return new Promise((resolve) =>
    {
        const server = createServer();

        server.once("error", () =>
        {
            resolve(false);
        });
        server.listen({ port, host: "127.0.0.1", exclusive: true }, () =>
        {
            server.close(() =>
            {
                resolve(true);
            });
        });
    });
}

export async function refuseTaken(ports: readonly number[]): Promise<void>
{
    for (const port of ports)
    {
        if (!(await listens(port)))
        {
            throw new E2eFault("PORT_TAKEN", `e2e: port ${String(port)} is taken. Stop what holds it (never by name on a shared machine), or pass another port.`);
        }
    }
}

export function freePorts(count: number): Promise<number[]>
{
    return Promise.all(Array.from({ length: count }, () => new Promise<number>((resolve, fail) =>
    {
        const server = createServer();

        server.once("error", fail);
        server.listen({ port: 0, host: "127.0.0.1" }, () =>
        {
            const address = server.address();
            const port = typeof address === "object" && address !== null ? address.port : 0;

            server.close(() =>
            {
                resolve(port);
            });
        });
    })));
}
