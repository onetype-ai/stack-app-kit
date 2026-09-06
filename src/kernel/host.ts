import { Fault } from "./errors";

/**
 * What a plugin may do, and when.
 *
 * Offering an api and subscribing are boot-time acts. Allowing them later
 * would mean an application mounted at second five saw different rules than
 * one mounted at second six.
 */
type Phase = "booting" | "running" | "stopped";

/** Where a line goes. The application decides; a plugin never writes directly. */
export type WriteLine = (line: string, about?: Readonly<Record<string, unknown>>) => void;

type Listener = { who: string; run: (payload: unknown) => void };

/**
 * The state every Host view shares.
 *
 * Views differ only in which plugin they report as the actor, so the wiring
 * lives behind one reference and is never copied.
 */
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

    /** The plugin this view belongs to. Empty outside one, as in a test. */
    get who(): string
    {
        return this.#who;
    }

    /** A view of the same wiring reporting a different actor. */
    as(who: string): Host
    {
        return new Host(this.#shared.say, this.#shared, who);
    }

    /** Moves the phase on. The kernel calls this; a plugin cannot. */
    enter(phase: Phase): void
    {
        this.#shared.at = phase;
    }

    /** Writes a line, wherever the application decided lines go. */
    say(line: string, about?: Readonly<Record<string, unknown>>): void
    {
        this.#shared.say(line, about);
    }

    /** Publishes this plugin's api under a name. Boot only, once per name. */
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

    /**
     * Returns the api a plugin offered, or undefined when none did.
     *
     * A plugin that declared the name in needs is guaranteed an answer,
     * because boot order put the provider first. Take once, at boot.
     */
    take<Api>(name: string): Api | undefined
    {
        return this.#shared.offers.get(name) as Api | undefined;
    }

    /** Every offered name, sorted. For diagnosis. */
    offers(): string[]
    {
        return [...this.#shared.offers.keys()].sort();
    }

    /** Subscribes to an event. Boot only. */
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

    /**
     * Delivers an event to every listener but the one that emitted.
     *
     * A listener that throws is caught and reported: one bad subscriber must
     * not take down the operation that emitted, nor the listeners behind it.
     */
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

    /** How many listeners an event has. For diagnosis. */
    listenerCount(name: string): number
    {
        return (this.#shared.listeners.get(name) ?? []).length;
    }
}
