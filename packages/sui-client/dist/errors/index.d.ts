export declare class ContractDataParsingError extends Error {
    readonly errorType: string;
    readonly functionName: string;
    readonly moduleAddress: string;
    readonly errorMessage: string;
    constructor(dryResult: any);
}
