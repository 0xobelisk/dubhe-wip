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
    watchPg?: boolean | undefined;
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
    graphqlRoute: string;
    graphiqlRoute: string;
    graphiqlHtmlGenerator: (req: import("http").IncomingMessage, res: import("http").ServerResponse, config?: any) => string;
    includeExtensionResources: boolean;
    ignoreTable: (tableName: string) => boolean;
    graphiqlOptions: {
        headerEditorEnabled: boolean;
        requestCredentials: string;
    };
    exportGqlSchemaPath: string | undefined;
};
//# sourceMappingURL=postgraphile-config.d.ts.map