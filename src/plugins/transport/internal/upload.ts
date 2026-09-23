import type { UploadRequest, Uploader } from "../api";
import { address } from "./address";
import { TransportFault } from "./faults";

type UploadSettings = {
    baseUrl: string;
    headers: () => Readonly<Record<string, string>>;
    uploader: Uploader | undefined;
    onUnauthorized: ((path: string) => void) | undefined;
};

function readBody(text: string): unknown
{
    if (text === "")
    {
        return undefined;
    }

    try
    {
        return JSON.parse(text) as unknown;
    }
    catch
    {
        return undefined;
    }
}

export const xhrUploader: Uploader = (upload) =>
{
    const Request = (globalThis as { XMLHttpRequest?: new () => XMLHttpRequest }).XMLHttpRequest;

    if (Request === undefined)
    {
        return Promise.reject(new TransportFault("CLIENT", "transport: this runtime has no XMLHttpRequest to upload with. Pass transport.uploader.", { method: upload.method, path: upload.url }));
    }

    return new Promise((resolve, fail) =>
    {
        const request = new Request();
        const abort = (): void =>
        {
            request.abort();
        };

        request.open(upload.method, upload.url);

        for (const [name, value] of Object.entries(upload.headers))
        {
            request.setRequestHeader(name, value);
        }

        request.upload.addEventListener("progress", (event) =>
        {
            upload.onProgress?.(event.loaded, event.lengthComputable ? event.total : 0);
        });
        request.addEventListener("load", () =>
        {
            upload.signal?.removeEventListener("abort", abort);
            resolve({ status: request.status, body: readBody(request.responseText) });
        });
        request.addEventListener("error", () =>
        {
            upload.signal?.removeEventListener("abort", abort);
            fail(new TransportFault("NETWORK", "The upload could not reach the server.", { method: upload.method, path: upload.url }));
        });
        request.addEventListener("abort", () =>
        {
            fail(new TransportFault("ABORTED", "The upload was aborted.", { method: upload.method, path: upload.url }));
        });

        if (upload.signal?.aborted === true)
        {
            request.abort();

            return;
        }

        upload.signal?.addEventListener("abort", abort);
        request.send(upload.body);
    });
};

export async function sendUpload(settings: UploadSettings, request: UploadRequest): Promise<unknown>
{
    const method = request.method ?? "POST";
    const isFile = typeof Blob !== "undefined" && request.body instanceof Blob;
    const isForm = typeof FormData !== "undefined" && request.body instanceof FormData;

    if (!isFile && !isForm)
    {
        throw new TransportFault("CLIENT", `transport: an upload to "${request.path}" takes a Blob or a FormData. Send JSON with request().`, { method, path: request.path });
    }

    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(isFile && (request.body as Blob).type !== "" && { "Content-Type": (request.body as Blob).type }),
        ...settings.headers(),
        ...request.headers,
    };
    const answer = await (settings.uploader ?? xhrUploader)({
        url: address(settings.baseUrl, request.path, request.query),
        method,
        headers,
        body: request.body,
        ...(request.signal !== undefined && { signal: request.signal }),
        ...(request.onProgress !== undefined && { onProgress: request.onProgress }),
    });

    if (answer.status >= 200 && answer.status < 300)
    {
        return answer.status === 204 ? undefined : answer.body;
    }

    const refusal = TransportFault.fromStatus(answer.status, { method, path: request.path, body: answer.body });

    if (refusal.code === "UNAUTHORIZED")
    {
        settings.onUnauthorized?.(request.path);
    }

    throw refusal;
}
