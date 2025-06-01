import type { DynamicTable } from './database-introspector';
export interface WelcomePageConfig {
    port: string | number;
    graphqlEndpoint: string;
    nodeEnv: string;
    schema: string;
    enableCors: string;
    enableSubscriptions: string;
}
export declare function createWelcomePage(tables: DynamicTable[], config: WelcomePageConfig): string;
//# sourceMappingURL=welcome-page.d.ts.map