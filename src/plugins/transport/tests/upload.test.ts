import { afterEach, describe, expect, test, vi } from "vitest";

import { boot } from "../../../kernel/boot";
import { from } from "../api";
import type { Transport, TransportOptions, Uploader } from "../api";
import { transportPlugin } from "../plugin";

const quiet = (): void => {};

afterEach(() =>
{
    vi.unstubAllGlobals();
});

function uploading(answers: { status: number; body?: unknown }[], settings: Partial<TransportOptions> = {})
{
    const sent: Parameters<Uploader>[0][] = [];
    const unauthorized: string[] = [];
    let at = 0;
    const app = boot(quiet, [transportPlugin({
        baseUrl: "https://example.test/api",
        headers: () => ({ "x-workspace": "a" }),
        onUnauthorized: (path) => unauthorized.push(path),
        uploader: async (upload) =>
        {
            sent.push(upload);
            upload.onProgress?.(5, 10);

            const answer = answers[Math.min(at, answers.length - 1)] ?? { status: 200 };

            at += 1;

            return { status: answer.status, body: answer.body };
        },
        ...settings,
    })]);

    return { transport: from(app.host) as Transport, sent, unauthorized };
}

describe("an upload", () =>
{
    test("sends a file as it is, with its type and the headers every request carries", async () =>
    {
        const run = uploading([{ status: 201, body: { id: "f-1" } }]);
        const progress: number[][] = [];

        const answered = await run.transport.upload({ path: "/items/1/files", body: new Blob(["hello"], { type: "text/plain" }), onProgress: (sent, total) => progress.push([sent, total]) });

        expect(answered).toEqual({ id: "f-1" });
        expect(run.sent[0]).toMatchObject({ url: "https://example.test/api/items/1/files", method: "POST", headers: { "Content-Type": "text/plain", "x-workspace": "a", Accept: "application/json" } });
        expect(progress).toEqual([[5, 10]]);
    });

    test("leaves a form's content type to the browser, which adds the boundary", async () =>
    {
        const run = uploading([{ status: 204 }]);
        const form = new FormData();
        form.append("file", new Blob(["x"]), "x.txt");

        const answered = await run.transport.upload({ path: "/files", body: form, method: "PUT" });

        expect(answered).toBeUndefined();
        expect(run.sent[0]?.headers).not.toHaveProperty("Content-Type");
        expect(run.sent[0]?.method).toBe("PUT");
    });

    test("is never retried, so a file is never stored twice", async () =>
    {
        const run = uploading([{ status: 503 }, { status: 201 }]);

        const failed = await run.transport.upload({ path: "/files", body: new Blob(["x"]) }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ code: "SERVER" });
        expect(run.sent).toHaveLength(1);
    });

    test("carries the server's refusal and says a 401 once", async () =>
    {
        const run = uploading([{ status: 400, body: { fields: { file: "too large" } } }, { status: 401 }]);

        const refused = await run.transport.upload({ path: "/files", body: new Blob(["x"]) }).catch((error: unknown) => error);
        await run.transport.upload({ path: "/files", body: new Blob(["x"]) }).catch(() => undefined);

        expect(refused).toMatchObject({ code: "CLIENT", body: { fields: { file: "too large" } } });
        expect(run.unauthorized).toEqual(["/files"]);
    });

    test("refuses a path leaving the base, since the upload carries this app's headers", async () =>
    {
        const run = uploading([{ status: 200 }]);

        const failed = await run.transport.upload({ path: "https://elsewhere.example/files", body: new Blob(["x"]) }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ code: "OFF_BASE" });
        expect(run.sent).toEqual([]);
    });

    test("refuses a body that is neither a file nor a form, naming what to use", async () =>
    {
        const run = uploading([{ status: 200 }]);

        const failed = await run.transport.upload({ path: "/files", body: { name: "x" } as unknown as Blob }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ code: "CLIENT", message: expect.stringContaining("Send JSON with request()") });
    });
});

describe("the default uploader", () =>
{
    class FakeRequest
    {
        static last: FakeRequest | undefined;
        readonly headers: Record<string, string> = {};
        readonly upload = new EventTarget();
        readonly events = new EventTarget();
        status = 0;
        responseText = "";
        opened: string[] = [];
        aborted = false;

        constructor()
        {
            FakeRequest.last = this;
        }

        open(method: string, url: string): void
        {
            this.opened = [method, url];
        }

        setRequestHeader(name: string, value: string): void
        {
            this.headers[name] = value;
        }

        addEventListener(kind: string, listener: EventListener): void
        {
            this.events.addEventListener(kind, listener);
        }

        send(): void
        {
            this.upload.dispatchEvent(Object.assign(new Event("progress"), { loaded: 3, total: 9, lengthComputable: true }));
        }

        abort(): void
        {
            this.aborted = true;
            this.events.dispatchEvent(new Event("abort"));
        }

        answer(status: number, text: string): void
        {
            this.status = status;
            this.responseText = text;
            this.events.dispatchEvent(new Event("load"));
        }
    }

    function withoutUploader()
    {
        const app = boot(quiet, [transportPlugin({ baseUrl: "https://example.test/api" })]);

        return from(app.host) as Transport;
    }

    test("uploads with XMLHttpRequest, reporting progress and reading the answer", async () =>
    {
        vi.stubGlobal("XMLHttpRequest", FakeRequest);
        const progress: number[][] = [];

        const pending = withoutUploader().upload({ path: "/files", body: new Blob(["x"]), onProgress: (sent, total) => progress.push([sent, total]) });
        FakeRequest.last?.answer(201, "{\"id\":\"f-1\"}");

        expect(await pending).toEqual({ id: "f-1" });
        expect(FakeRequest.last?.opened).toEqual(["POST", "https://example.test/api/files"]);
        expect(progress).toEqual([[3, 9]]);
    });

    test("stops when its signal aborts, answering ABORTED", async () =>
    {
        vi.stubGlobal("XMLHttpRequest", FakeRequest);
        const aborter = new AbortController();

        const pending = withoutUploader().upload({ path: "/files", body: new Blob(["x"]), signal: aborter.signal }).catch((error: unknown) => error);
        aborter.abort();

        expect(await pending).toMatchObject({ code: "ABORTED" });
        expect(FakeRequest.last?.aborted).toBe(true);
    });

    test("refuses where there is no XMLHttpRequest, naming the option to pass", async () =>
    {
        vi.stubGlobal("XMLHttpRequest", undefined);

        const failed = await withoutUploader().upload({ path: "/files", body: new Blob(["x"]) }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ code: "CLIENT", message: expect.stringContaining("Pass transport.uploader") });
    });
});
