const secretKey = /token|secret|password|passwd|authorization|cookie|session|api[-_]?key|private[-_]?key|credential/i;

const secretValue = /\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sk|rk|whsec)_[A-Za-z0-9_]{8,}/g;

export const redacted = "[redacted]";

export function redactKey(key: string): boolean
{
    return secretKey.test(key);
}

export function redactText(text: string): string
{
    return text.replace(secretValue, redacted);
}
