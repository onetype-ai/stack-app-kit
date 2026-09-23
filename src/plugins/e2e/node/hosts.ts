import { execFileSync } from "node:child_process";
import { X509Certificate, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createPlainServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { E2eFault } from "./faults";
import { checkedHostnames } from "./flags";
import { refuseTaken } from "./ports";

/** Static pages by path, e.g. `{ "/": "<html>…</html>" }`: what a host page fixture serves. */
export type Pages = Readonly<Record<string, string>>;

/** A running fixture server, and its own stop. */
export type RunningHosts = {
    origin: (hostname?: string) => string;
    close: () => Promise<void>;
};

/** A secure fixture server, with the hash of its per-run certificate for `Browsers.launch({ trustSpki })`. */
export type RunningSecureHosts = RunningHosts & { spki: string };

function serving(pages: Pages)
{
    return (request: IncomingMessage, response: ServerResponse): void =>
    {
        const page = pages[new URL(request.url ?? "/", "http://fixture").pathname];

        response.writeHead(page === undefined ? 404 : 200, { "content-type": "text/html; charset=utf-8" });
        response.end(page ?? "");
    };
}

function listen(server: Server, port: number): Promise<void>
{
    return new Promise((resolve, fail) =>
    {
        server.once("error", fail);
        server.listen(port, "127.0.0.1", () =>
        {
            resolve();
        });
    });
}

function closing(server: Server, after: () => void = () => {}): () => Promise<void>
{
    return () => new Promise((resolve) =>
    {
        server.close(() =>
        {
            after();
            resolve();
        });
    });
}

export async function startHosts(options: { pages: Pages; port: number }): Promise<RunningHosts>
{
    await refuseTaken([options.port]);

    const server = createPlainServer(serving(options.pages));

    await listen(server, options.port);

    return { origin: (hostname = "127.0.0.1") => `http://${hostname}:${String(options.port)}`, close: closing(server) };
}

export async function startSecureHosts(options: { pages: Pages; hostnames: readonly string[]; port?: number | undefined }): Promise<RunningSecureHosts>
{
    const port = options.port ?? 443;
    const names = checkedHostnames(options.hostnames);

    if (port === 443 && process.env["CI"] === undefined)
    {
        throw new E2eFault("NOT_ON_CI", "e2e: startSecure on :443 runs only where CI is set (a runner of its own); skip this suite here, or pass another port.");
    }

    await refuseTaken([port]);

    const folder = mkdtempSync(join(tmpdir(), "stack-e2e-cert-"));
    const key = join(folder, "key.pem");
    const cert = join(folder, "cert.pem");

    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
        "-keyout", key, "-out", cert, "-subj", `/CN=${names[0] ?? "localhost"}`, "-addext", `subjectAltName=${names.map((name) => `DNS:${name}`).join(",")}`], { stdio: "ignore" });

    const certificate = readFileSync(cert);
    const spki = createHash("sha256").update(new X509Certificate(certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
    const server = createSecureServer({ key: readFileSync(key), cert: certificate }, serving(options.pages));

    await listen(server, port);

    return {
        spki,
        origin: (hostname = names[0] ?? "localhost") => port === 443 ? `https://${hostname}` : `https://${hostname}:${String(port)}`,
        close: closing(server, () =>
        {
            rmSync(folder, { recursive: true, force: true });
        }),
    };
}
