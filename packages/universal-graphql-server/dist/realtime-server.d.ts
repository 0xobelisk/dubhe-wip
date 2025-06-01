export declare class RealtimeSubscriptionServer {
    private wss;
    private pgPool;
    private pgClient;
    private clients;
    private isListening;
    constructor(port: number, dbUrl: string);
    private setupPostgreSQLListener;
    private reconnectPostgreSQL;
    private setupWebSocketHandlers;
    private handleClientMessage;
    private sendToClient;
    private broadcast;
    sendTestMessage(table?: string): void;
    getStatus(): {
        isListening: boolean;
        clientCount: number;
        pgConnected: boolean;
    };
    close(): Promise<void>;
}
//# sourceMappingURL=realtime-server.d.ts.map