# 日志系统使用指南

## 概述

本项目使用 Winston 作为日志库，提供结构化的日志记录和管理。新的日志系统替换了原有的 `console.log` 和 `console.error`，提供更丰富的功能和更好的可维护性。

## 主要特性

- 🎨 **彩色输出**: 不同级别的日志使用不同颜色区分
- 📁 **文件记录**: 自动将日志保存到文件
- 🏷️ **组件标识**: 每个日志都标明来源组件
- 📊 **结构化数据**: 支持附加元数据和上下文信息
- ⚡ **性能监控**: 内置性能指标记录
- 🔒 **敏感信息保护**: 自动隐藏密码等敏感信息

## 日志级别

- **error**: 错误信息
- **warn**: 警告信息
- **info**: 一般信息（默认级别）
- **debug**: 调试信息
- **verbose**: 详细信息

通过环境变量 `LOG_LEVEL` 可以控制日志输出级别：

```bash
export LOG_LEVEL=debug  # 显示所有级别的日志
export LOG_LEVEL=warn   # 只显示警告和错误
```

## 预定义的Logger组件

### 1. 数据库Logger (`dbLogger`)
用于记录数据库相关操作：

```typescript
import { dbLogger, logDatabaseOperation } from './logger';

// 基础使用
dbLogger.info('数据库连接成功', { schema: 'public' });
dbLogger.error('查询失败', error, { query: 'SELECT * FROM users' });

// 便捷函数
logDatabaseOperation('SELECT', 'users', { rowCount: 10 });
```

### 2. 服务器Logger (`serverLogger`)
用于记录HTTP服务器相关事件：

```typescript
import { serverLogger } from './logger';

serverLogger.info('服务器启动', { port: 4000 });
serverLogger.warn('404 - 路径未找到', { url: '/unknown' });
```

### 3. WebSocket Logger (`wsLogger`)
用于记录WebSocket和实时通信：

```typescript
import { wsLogger, logWebSocketEvent } from './logger';

wsLogger.info('新的WebSocket连接', { clientId: 'client-123' });
logWebSocketEvent('连接建立', 5, { totalClients: 5 });
```

### 4. GraphQL Logger (`gqlLogger`)
用于记录GraphQL查询和操作：

```typescript
import { gqlLogger, logGraphQLQuery } from './logger';

gqlLogger.info('GraphQL查询执行', { operationName: 'GetUsers' });
logGraphQLQuery('query', 'query GetUsers { users { id name } }');
```

### 5. 订阅Logger (`subscriptionLogger`)
用于记录订阅相关操作：

```typescript
import { subscriptionLogger } from './logger';

subscriptionLogger.info('创建动态订阅', { tableCount: 10 });
```

### 6. 系统Logger (`systemLogger`)
用于记录系统级别事件：

```typescript
import { systemLogger } from './logger';

systemLogger.info('应用启动', { nodeVersion: process.version });
systemLogger.error('未捕获异常', error);
```

## 性能监控

使用 `logPerformance` 函数记录操作耗时：

```typescript
import { logPerformance } from './logger';

const startTime = Date.now();
// ... 执行操作
logPerformance('数据库查询', startTime, { tableName: 'users' });
```

## 日志文件

日志文件自动保存在 `logs/` 目录下：

- `logs/combined.log`: 所有级别的日志（JSON格式）
- `logs/error.log`: 只包含错误级别的日志
- `logs/exceptions.log`: 未捕获的异常
- `logs/rejections.log`: 未处理的Promise拒绝

## 最佳实践

### 1. 使用合适的日志级别

```typescript
// ✅ 正确
dbLogger.debug('执行查询', { sql: query });  // 调试信息
dbLogger.info('连接建立', { host: 'localhost' });  // 一般信息
dbLogger.warn('连接池即将满', { poolSize: 95 });  // 警告
dbLogger.error('连接失败', error, { attempts: 3 });  // 错误

// ❌ 错误
dbLogger.info('调试查询详情...', { sql: query });  // 应该使用debug
dbLogger.error('用户登录', { userId: 123 });  // 应该使用info
```

### 2. 包含有用的上下文信息

```typescript
// ✅ 正确 - 包含有用上下文
serverLogger.info('处理GraphQL请求', {
  operationName: 'GetUsers',
  variables: { limit: 10 },
  userAgent: req.headers['user-agent'],
  ip: req.ip
});

// ❌ 错误 - 缺少上下文
serverLogger.info('处理请求');
```

### 3. 保护敏感信息

```typescript
// ✅ 正确 - 隐藏密码
dbLogger.info('数据库连接配置', {
  host: 'localhost',
  database: 'mydb',
  user: 'admin',
  password: '****'  // 隐藏密码
});

// ❌ 错误 - 暴露敏感信息
dbLogger.info('连接字符串', { 
  connectionString: 'postgres://admin:secret123@localhost:5432/mydb' 
});
```

### 4. 错误处理最佳实践

```typescript
// ✅ 正确 - 记录错误和上下文
try {
  await database.query(sql);
} catch (error) {
  dbLogger.error('查询执行失败', error, {
    sql: sql.substring(0, 100),  // 只记录前100个字符
    parameters: params,
    userId: user.id
  });
  throw error;  // 重新抛出错误
}

// ❌ 错误 - 只记录错误信息
try {
  await database.query(sql);
} catch (error) {
  dbLogger.error('查询失败', error);
}
```

## 环境变量配置

在 `.env` 文件中配置日志相关参数：

```bash
# 日志级别 (error, warn, info, debug, verbose)
LOG_LEVEL=info

# 是否启用文件日志
LOG_TO_FILE=true

# 日志文件路径
LOG_DIR=./logs

# PostGraphile SQL查询日志控制
DISABLE_QUERY_LOG=false     # 设置为true完全禁用SQL查询日志
ENABLE_QUERY_LOG=false      # 生产环境中设置为true强制启用查询日志
QUERY_TIMEOUT=30000         # GraphQL查询超时时间（毫秒）
```

### SQL查询日志控制

PostGraphile会输出SQL查询执行日志，如：
```
0 error(s) in 50.96ms :: query MyQuery { ... }
```

控制这些日志的方法：

```bash
# 完全禁用SQL查询日志
DISABLE_QUERY_LOG=true

# 开发环境默认启用，生产环境默认禁用
# 生产环境强制启用查询日志
ENABLE_QUERY_LOG=true

# 调整查询超时时间（默认30秒）
QUERY_TIMEOUT=10000  # 10秒
```

## 迁移指南

### 从 console.log 迁移

```typescript
// 旧代码
console.log('🚀 服务器启动成功！');
console.log(`端口: ${port}`);

// 新代码
serverLogger.info('🚀 服务器启动成功！', { port });
```

### 从 console.error 迁移

```typescript
// 旧代码
console.error('❌ 数据库连接失败:', error);

// 新代码
dbLogger.error('数据库连接失败', error, { 
  host: config.host,
  database: config.database 
});
```

## 开发调试

在开发环境中，建议设置详细的日志级别：

```bash
# 开发环境
export LOG_LEVEL=debug
export NODE_ENV=development

# 生产环境
export LOG_LEVEL=info
export NODE_ENV=production
```

## 故障排查

### 1. 日志文件未生成

检查 `logs/` 目录权限和磁盘空间。

### 2. 日志级别过高

确认 `LOG_LEVEL` 环境变量设置正确。

### 3. 性能问题

在生产环境中使用 `info` 或 `warn` 级别，避免大量 `debug` 日志影响性能。

## 示例：完整的错误处理

```typescript
import { dbLogger, serverLogger, logPerformance } from './logger';

export class UserService {
  async getUser(userId: string) {
    const startTime = Date.now();
    
    try {
      dbLogger.debug('开始查询用户', { userId });
      
      const user = await this.database.findUser(userId);
      
      if (!user) {
        dbLogger.warn('用户不存在', { userId });
        return null;
      }
      
      logPerformance('用户查询', startTime, { userId, found: true });
      dbLogger.info('用户查询成功', { userId, username: user.username });
      
      return user;
      
    } catch (error) {
      dbLogger.error('用户查询失败', error, { 
        userId,
        operation: 'getUser',
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
}
```

通过这个新的日志系统，您将获得更好的调试体验、更清晰的系统状态监控，以及更容易的问题定位能力。