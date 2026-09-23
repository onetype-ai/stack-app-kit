import { E2eFault } from "./faults";

const hostname = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

const spkiHash = /^[A-Za-z0-9+/]{43}=$/u;

export function checkedHostnames(hosts: readonly string[]): readonly string[]
{
    const refused = hosts.filter((host) => !hostname.test(host));

    if (refused.length > 0)
    {
        throw new E2eFault("UNSAFE_FLAG", `e2e: these hostnames cannot be mapped safely: ${refused.map((host) => JSON.stringify(host)).join(", ")}. Pass lowercase dotted names such as shop.example.test.`);
    }

    return hosts;
}

export function browserFlags(hosts: readonly string[], trustSpki: readonly string[]): string[]
{
    checkedHostnames(hosts);

    if (trustSpki.some((hash) => !spkiHash.test(hash)))
    {
        throw new E2eFault("UNSAFE_FLAG", "e2e: trustSpki takes base64 SHA-256 hashes only. Pass the spki Hosts.startSecure answered.");
    }

    return [
        ...(hosts.length === 0 ? [] : [`--host-resolver-rules=${hosts.map((host) => `MAP ${host} 127.0.0.1`).join(", ")}`]),
        ...(trustSpki.length === 0 ? [] : [`--ignore-certificate-errors-spki-list=${trustSpki.join(",")}`]),
    ];
}
