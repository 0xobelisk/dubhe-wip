import type { IncomingMessage, ServerResponse } from 'http';
export interface PlaygroundOptions {
    url: string;
    subscriptionUrl?: string;
    title?: string;
    subtitle?: string;
}
export declare function createEnhancedPlayground(options: PlaygroundOptions): (req: IncomingMessage, res: ServerResponse, config?: any) => string;
//# sourceMappingURL=enhanced-playground.d.ts.map