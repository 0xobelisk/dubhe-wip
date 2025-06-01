export interface SubscriptionConfig {
    enableSubscriptions: string;
    tableNames: string[];
}
export declare class SubscriptionManager {
    private config;
    constructor(config: SubscriptionConfig);
    loadSubscriptionPlugins(): Promise<{
        pluginHook: null;
        success: boolean;
    } | {
        pluginHook: import("postgraphile/build/postgraphile/pluginHook").PluginHookFn;
        success: boolean;
    }>;
    logSubscriptionStatus(success: boolean): void;
}
//# sourceMappingURL=subscription-manager.d.ts.map