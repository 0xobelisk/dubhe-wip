# Dubhe Logger System

基于Pino的高性能日志系统，采用面向对象设计，更易于理解和扩展。

## 特性

- 🚀 基于Pino的高性能日志记录
- 📝 支持结构化日志记录
- 🎨 开发环境支持彩色pretty打印
- 📁 生产环境支持文件日志记录
- 🔧 灵活的配置选项
- 📦 组件化日志管理
- 🛡️ TypeScript类型安全

## 基本使用

### 1. 使用预定义的组件Logger

```typescript
import { dbLogger, serverLogger, systemLogger } from './utils/logger';

// 数据库操作日志
dbLogger.info('连接数据库成功', { host: 'localhost', port: 5432 });
dbLogger.error('查询失败', new Error('连接超时'), { query: 'SELECT * FROM users' });

// 服务器日志
serverLogger.info('服务器启动', { port: 4000, env: 'development' });

// 系统日志
systemLogger.warn('内存使用率高', { usage: '85%' });
```

### 2. 创建自定义组件Logger

```typescript
import { createComponentLogger } from './utils/logger';

const apiLogger = createComponentLogger('api');
const cacheLogger = createComponentLogger('cache');

apiLogger.info('API请求', { method: 'GET', path: '/users', userId: 123 });
cacheLogger.debug('缓存命中', { key: 'user:123', ttl: 3600 });
```

### 3. 使用Logger类创建自定义实例

```typescript
import { Logger } from './utils/logger';

// 创建自定义配置的logger
const customLogger = new Logger({
  level: 'debug',
  service: 'my-service',
  enableFileLogging: true,
  logsDir: './custom-logs',
  enablePrettyPrint: false
});

const myLogger = customLogger.createComponentLogger('my-component');
myLogger.info('自定义日志消息');
```

## 配置选项

```typescript
interface LoggerConfig {
  level?: string;              // 日志级别 (debug|info|warn|error)
  service?: string;            // 服务名称
  component?: string;          // 组件名称
  enableFileLogging?: boolean; // 是否启用文件日志
  logsDir?: string;           // 日志文件目录
  enablePrettyPrint?: boolean; // 是否启用彩色输出
}
```

## 工具函数

### 性能日志

```typescript
import { logPerformance } from './utils/logger';

const startTime = Date.now();
// ... 执行操作
logPerformance('数据库查询', startTime, { table: 'users', rows: 1000 });
```

### 数据库操作日志

```typescript
import { logDatabaseOperation } from './utils/logger';

logDatabaseOperation('SELECT', 'users', { limit: 10, offset: 0 });
```

### WebSocket事件日志

```typescript
import { logWebSocketEvent } from './utils/logger';

logWebSocketEvent('client_connected', 5, { clientId: 'abc123' });
```

### GraphQL查询日志

```typescript
import { logGraphQLQuery } from './utils/logger';

logGraphQLQuery('query', 'query GetUsers { users { id name } }', { limit: 10 });
```

## 预定义的组件Logger

| Logger | 组件名 | 用途 |
|--------|--------|------|
| `dbLogger` | database | 数据库操作 |
| `serverLogger` | server | 服务器相关 |
| `wsLogger` | websocket | WebSocket连接 |
| `gqlLogger` | graphql | GraphQL查询 |
| `subscriptionLogger` | subscription | 订阅功能 |
| `systemLogger` | system | 系统级别 |
| `authLogger` | auth | 认证授权 |
| `perfLogger` | performance | 性能监控 |

## 环境变量

- `LOG_LEVEL`: 设置日志级别 (debug|info|warn|error)
- `NODE_ENV`: 设置环境模式，development时启用pretty打印

## 日志格式

### 开发环境 (Pretty Print)
```
2024-01-15 10:30:45 [INFO] dubhe-graphql-server [database]: 连接数据库成功 {"host": "localhost", "port": 5432}
```

### 生产环境 (JSON)
```json
{"level":30,"time":"2024-01-15T10:30:45.123Z","service":"dubhe-graphql-server","component":"database","msg":"连接数据库成功","host":"localhost","port":5432}
```

## 高级用法

### 扩展Logger类

```typescript
import { Logger, LoggerConfig } from './utils/logger';

class CustomLogger extends Logger {
  constructor(config: LoggerConfig) {
    super(config);
  }

  // 添加自定义方法
  public audit(action: string, userId: string, meta?: any) {
    const auditLogger = this.createComponentLogger('audit');
    auditLogger.info(`用户操作: ${action}`, { userId, timestamp: new Date().toISOString(), ...meta });
  }
}

const logger = new CustomLogger({ service: 'audit-service' });
logger.audit('login', 'user123', { ip: '192.168.1.1' });
```

### 获取原始Pino实例

```typescript
import { Logger } from './utils/logger';

const logger = new Logger();
const pinoInstance = logger.getPinoInstance();

// 直接使用Pino API
pinoInstance.info({ customField: 'value' }, '直接使用Pino');
```

## 迁移指南

从winston迁移到新的Logger系统：

### 之前 (Winston)
```typescript
import logger from './logger';
logger.info('消息', { meta: 'data' });
```

### 现在 (Pino + Class)
```typescript
import { systemLogger } from './utils/logger';
systemLogger.info('消息', { meta: 'data' });
```

大部分API保持兼容，只需要更新import路径即可。 