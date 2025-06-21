// Subscription configuration manager - supports dynamic configuration for three subscription modes

export interface SubscriptionCapabilities {
  liveQueries: boolean;
  pgSubscriptions: boolean;
  nativeWebSocket: boolean;
}

export interface SubscriptionConfig {
  // Basic configuration
  enableSubscriptions: boolean;

  // Capability configuration
  capabilities: SubscriptionCapabilities;

  // Database configuration detection
  walLevel: 'minimal' | 'replica' | 'logical';
  pgVersion: string;

  // Port configuration
  graphqlPort: number;
  websocketPort?: number;

  // Performance configuration
  maxConnections: number;
  heartbeatInterval: number;

  // Debug configuration
  enableNotificationLogging: boolean;
  enablePerformanceMetrics: boolean;
}

export class SubscriptionConfigManager {
  private config: SubscriptionConfig;

  constructor(envVars: Record<string, string>) {
    this.config = this.parseEnvironmentVariables(envVars);
  }

  // Parse configuration from environment variables
  private parseEnvironmentVariables(env: Record<string, string>): SubscriptionConfig {
    const enableSubscriptions = env.ENABLE_SUBSCRIPTIONS !== 'false'; // Default enabled unless explicitly set to false

    // Auto-detect WAL level (in actual applications, query through database)
    const walLevel = this.detectWalLevel(env.DATABASE_URL);

    // Determine capabilities based on WAL level and environment variables - default enable all features
    const capabilities: SubscriptionCapabilities = {
      liveQueries:
        enableSubscriptions && env.ENABLE_LIVE_QUERIES !== 'false' && walLevel === 'logical',

      pgSubscriptions: enableSubscriptions && env.ENABLE_PG_SUBSCRIPTIONS !== 'false',

      nativeWebSocket: enableSubscriptions && env.ENABLE_NATIVE_WEBSOCKET !== 'false'
    };

    return {
      enableSubscriptions,
      capabilities,
      walLevel,
      pgVersion: '13+', // In actual applications, get through query

      graphqlPort: parseInt(env.PORT || '4000'),
      websocketPort: env.REALTIME_PORT ? parseInt(env.REALTIME_PORT) : undefined,

      maxConnections: parseInt(env.MAX_SUBSCRIPTION_CONNECTIONS || '1000'),
      heartbeatInterval: parseInt(env.SUBSCRIPTION_HEARTBEAT_INTERVAL || '30000'),

      enableNotificationLogging: env.DEBUG_NOTIFICATIONS === 'true',
      enablePerformanceMetrics: env.ENABLE_SUBSCRIPTION_METRICS === 'true'
    };
  }

  // Detect database WAL level
  private detectWalLevel(databaseUrl?: string): 'minimal' | 'replica' | 'logical' {
    // In actual applications should query database
    // SELECT setting FROM pg_settings WHERE name = 'wal_level';

    // Currently return default value
    return 'replica';
  }

  // Get current configuration
  getConfig(): SubscriptionConfig {
    return { ...this.config };
  }

  // Check if specific capability is available
  isCapabilityEnabled(capability: keyof SubscriptionCapabilities): boolean {
    return this.config.capabilities[capability];
  }

  // Get recommended subscription method
  getRecommendedSubscriptionMethod(): string {
    if (this.config.capabilities.liveQueries) {
      return 'live-queries';
    } else if (this.config.capabilities.pgSubscriptions) {
      return 'pg-subscriptions';
    } else if (this.config.capabilities.nativeWebSocket) {
      return 'native-websocket';
    } else {
      return 'none';
    }
  }

  // Generate client configuration
  generateClientConfig() {
    const baseUrl = `http://localhost:${this.config.graphqlPort}`;

    return {
      graphqlEndpoint: `${baseUrl}/graphql`,
      subscriptionEndpoint:
        this.config.capabilities.pgSubscriptions || this.config.capabilities.liveQueries
          ? `ws://localhost:${this.config.graphqlPort}/graphql`
          : undefined,
      nativeWebSocketEndpoint: this.config.capabilities.nativeWebSocket
        ? `ws://localhost:${this.config.websocketPort || this.config.graphqlPort}`
        : undefined,
      capabilities: this.config.capabilities,
      recommendedMethod: this.getRecommendedSubscriptionMethod()
    };
  }

  // Generate PostGraphile configuration - simplified version, only keep listen subscriptions
  generatePostGraphileConfig() {
    return {
      subscriptions: this.config.enableSubscriptions,
      live: false, // Disable live queries, only use listen subscriptions
      simpleSubscriptions: this.config.capabilities.pgSubscriptions,

      // Performance configuration - optimized for listen subscriptions
      pgSettings: {
        statement_timeout: '30s',
        default_transaction_isolation: 'read committed'
      },

      // Monitoring configuration
      allowExplain: this.config.enablePerformanceMetrics,
      disableQueryLog: !this.config.enableNotificationLogging
    };
  }

  // Generate environment variable documentation
  generateDocumentation(): string {
    return `
# 📡 Subscription System Configuration Guide

## Basic Configuration
ENABLE_SUBSCRIPTIONS=false         # Disable subscription features (default enabled, set to false to disable)

## Capability Configuration (optional, auto-detect by default)
ENABLE_LIVE_QUERIES=true           # Enable @live directive (requires wal_level=logical)
ENABLE_PG_SUBSCRIPTIONS=true       # Enable PostgreSQL subscriptions 
ENABLE_NATIVE_WEBSOCKET=true       # Enable native WebSocket

## Port Configuration
PORT=4000                          # GraphQL port
REALTIME_PORT=4001                 # Native WebSocket port (optional)

## Performance Configuration
MAX_SUBSCRIPTION_CONNECTIONS=1000  # Maximum connections
SUBSCRIPTION_HEARTBEAT_INTERVAL=30000  # Heartbeat interval (ms)

## Debug Configuration
DEBUG_NOTIFICATIONS=false         # Notification logging
ENABLE_SUBSCRIPTION_METRICS=false # Performance metrics

## Current Configuration Status:
- Subscription Features: ${this.config.enableSubscriptions ? '✅ Enabled' : '❌ Disabled'}
- Live Queries: ${this.config.capabilities.liveQueries ? '✅ Available' : '❌ Not Available'}
- PG Subscriptions: ${
      this.config.capabilities.pgSubscriptions ? '✅ Available' : '❌ Not Available'
    }  
- Native WebSocket: ${
      this.config.capabilities.nativeWebSocket ? '✅ Available' : '❌ Not Available'
    }
- WAL Level: ${this.config.walLevel}
- Recommended Method: ${this.getRecommendedSubscriptionMethod()}
		`;
  }
}

// Export singleton instance
export const subscriptionConfig = new SubscriptionConfigManager(
  process.env as Record<string, string>
);
