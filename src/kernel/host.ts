import { Fault } from "./errors";

type Phase = "booting" | "running" | "stopped";

/** Where a line goes. The application decides; a plugin never writes directly. */
export type WriteLine = (line: string, about?: Readonly<Record<string, unknown>>) => void;

type Listener = { who: string; run: (payload: unknown) => void };

type Wiring = {
    at: Phase;
    say: WriteLine;
    offers: Map<string, unknown>;
    owners: Map<string, string>;
    listeners: Map<string, Listener[]>;
};

/**
 * What every plugin receives. Carries the wiring, and nothing about any
 * particular plugin: the kernel names none.
 */
export class Host
{
    readonly #shared: Wiring;

    readonly #who: string;

    constructor(say: WriteLine, shared?: Wiring, who = "")
    {
        this.#shared = shared ?? {
            at: "booting",
            say,
            offers: new Map(),
            owners: new Map(),
            listeners: new Map(),
        };

        this.#who = who;
    }

    get who(): string
    {
        return this.#who;
    }

    as(who: string): Host
    {
        return new Host(this.#shared.say, this.#shared, who);
    }

    enter(phase: Phase): void
    {
        this.#shared.at = phase;
    }

    say(line: string, about?: Readonly<Record<string, unknown>>): void
    {
        this.#shared.say(line, about);
    }

    offer(name: string, api: unknown): void
    {
        if (this.#shared.at !== "booting")
        {
            throw new Fault("NOT_BOOTING", `offer "${name}" happened after boot.`, this.#who);
        }

        if (name === "")
        {
            throw new Fault("NO_NAME", "offer was given no name.", this.#who);
        }

        if (api === undefined || api === null)
        {
            throw new Fault("NO_API", `offer "${name}" was given nothing to offer.`, this.#who);
        }

        if (this.#shared.offers.has(name))
        {
            throw new Fault(
                "OFFERED_TWICE",
                `"${name}" was already offered by "${this.#shared.owners.get(name) ?? "?"}".`,
                this.#who,
            );
        }

        this.#shared.offers.set(name, api);
        this.#shared.owners.set(name, this.#who);
    }

    take<Api>(name: string): Api | undefined
    {
        return this.#shared.offers.get(name) as Api | undefined;
    }

    offers(): string[]
    {
        return [...this.#shared.offers.keys()].sort();
    }

    on(name: string, run: (payload: unknown) => void): void
    {
        if (this.#shared.at !== "booting")
        {
            throw new Fault("NOT_BOOTING", `on "${name}" happened after boot.`, this.#who);
        }

        const listeners = this.#shared.listeners.get(name) ?? [];

        listeners.push({ who: this.#who, run });
        this.#shared.listeners.set(name, listeners);
    }

    emit(name: string, payload: unknown): void
    {
        for (const listener of this.#shared.listeners.get(name) ?? [])
        {
            if (listener.who === this.#who)
            {
                continue;
            }

            try
            {
                listener.run(payload);
            }
            catch (cause)
            {
                this.say(`listener "${listener.who}" threw on "${name}"`, { cause });
            }
        }
    }

    listenerCount(name: string): number
    {
        return (this.#shared.listeners.get(name) ?? []).length;
    }
}
