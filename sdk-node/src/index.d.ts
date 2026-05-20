export interface PaceOptions {
}
export declare class Pace {
    private options?;
    constructor(options?: PaceOptions);
    /**
     * Checks a batch of IP addresses against the rate limiter.
     * * @param ips Array of IP address strings to check
     * @param cap Maximum number of requests allowed
     * @param rate The refill rate (tokens per second)
     * @returns An array of booleans (true = allowed, false = blocked)
     */
    checkBatch(ips: string[], cap: number, rate: number): boolean[];
}
//# sourceMappingURL=index.d.ts.map