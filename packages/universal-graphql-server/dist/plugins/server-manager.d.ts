import { IncomingMessage, ServerResponse } from 'http';
import { Pool } from 'pg';
import type { DynamicTable } from './database-introspector';
import { WelcomePageConfig } from './welcome-page';
import { PostGraphileConfigOptions } from './postgraphile-config';
export interface ServerConfig {
    port: string | number;
    graphqlEndpoint: string;
    enableSubscriptions: string;
    databaseUrl: string;
    realtimePort?: string | number;
}
export declare class ServerManager {
    private config;
    private realtimeServer;
    constructor(config: ServerConfig);
    createHttpServer(postgraphileMiddleware: any, allTables: DynamicTable[], welcomeConfig: WelcomePageConfig, postgraphileConfig: PostGraphileConfigOptions): import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
    startRealtimeServer(): Promise<void>;
    startDatabaseListener(databaseUrl: string): Promise<void>;
    gracefulShutdown(httpServer: any, pgPool: Pool): Promise<void>;
    logServerInfo(allTables: DynamicTable[], welcomeConfig: WelcomePageConfig): void;
}
//# sourceMappingURL=server-manager.d.ts.map