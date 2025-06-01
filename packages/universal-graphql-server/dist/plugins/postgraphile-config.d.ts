export interface PostGraphileConfigOptions {
    port: string | number;
    nodeEnv: string;
    graphqlEndpoint: string;
    enableSubscriptions: string;
    enableCors: string;
    databaseUrl: string;
    availableTables: string[];
}
export declare function createPostGraphileConfig(options: PostGraphileConfigOptions): {
    ownerConnectionString?: string | undefined;
    subscriptions: boolean;
    live: boolean;
    websocketMiddlewares?: never[] | undefined;
    pgSettings?: {
        statement_timeout: string;
    } | undefined;
    graphiql: boolean;
    enhanceGraphiql: boolean;
    showErrorStack: boolean;
    extendedErrors: string[];
    enableQueryBatching: boolean;
    enableCors: boolean;
    dynamicJson: boolean;
    setofFunctionsContainNulls: boolean;
    ignoreRBAC: boolean;
    ignoreIndexes: boolean;
    disableQueryLog: boolean;
    allowExplain: boolean;
    watchPg: boolean;
    graphqlRoute: string;
    appendPlugins: import("postgraphile").Plugin[];
    graphileBuildOptions: {
        connectionFilterAllowedOperators: string[];
        connectionFilterAllowedFieldTypes: string[];
        connectionFilterLogicalOperators: boolean;
        connectionFilterRelations: boolean;
        connectionFilterComputedColumns: boolean;
        connectionFilterArrays: boolean;
        connectionFilterSetofFunctions: boolean;
        connectionFilterAllowNullInput: boolean;
        connectionFilterAllowEmptyObjectInput: boolean;
    };
    includeExtensionResources: boolean;
    ignoreTable: (tableName: string) => boolean;
    exportGqlSchemaPath: string | undefined;
};
export declare function createPlaygroundHtml(options: PostGraphileConfigOptions): string;
//# sourceMappingURL=postgraphile-config.d.ts.map