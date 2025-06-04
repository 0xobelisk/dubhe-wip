# GraphQL 服务器插件架构

本目录包含了 Sui Indexer GraphQL 服务器的各个功能模块插件，采用模块化设计便于管理和扩展。

## 📁 插件结构

### 核心插件

#### `database-introspector.ts` - 数据库内省器
- **功能**: 扫描和分析数据库表结构
- **主要类**: `DatabaseIntrospector`
- **职责**:
  - 获取 store_* 动态表
  - 获取系统表（dubhe 相关）
  - 从 table_fields 获取字段信息
  - 测试数据库连接
  - 输出表结构日志

#### `welcome-page.ts` - 欢迎页面生成器
- **功能**: 生成服务器首页
- **主要函数**: `createWelcomePage()`
- **职责**:
  - 显示服务器状态和配置信息
  - 展示检测到的数据表
  - 提供导航链接和使用指南
  - 响应式设计和美观界面

#### `postgraphile-config.ts` - PostGraphile 配置生成器
- **功能**: 创建 PostGraphile 配置
- **主要函数**: `createPostGraphileConfig()`
- **职责**:
  - 配置 GraphQL 端点和功能
  - 集成增强版 Playground
  - 设置订阅和实时查询
  - 优化性能参数

#### `subscription-manager.ts` - 订阅管理器
- **功能**: 管理 GraphQL 订阅功能
- **主要类**: `SubscriptionManager`
- **职责**:
  - 加载 @graphile/pg-pubsub 插件
  - 配置自定义订阅插件
  - 错误处理和降级方案
  - 输出订阅状态信息

#### `server-manager.ts` - 服务器管理器
- **功能**: 管理 HTTP 和 WebSocket 服务器
- **主要类**: `ServerManager`
- **职责**:
  - 创建和配置 HTTP 服务器
  - 启动实时订阅服务器
  - 数据库变更监听
  - 优雅关闭处理

#### `enhanced-playground.ts` - 增强版 GraphQL Playground
- **功能**: 提供现代化的 GraphQL IDE
- **主要函数**: `createEnhancedPlayground()`
- **职责**:
  - 可视化 Schema Explorer
  - 代码导出功能
  - 现代化 UI 界面
  - 快捷键支持

## 🔧 使用方式

### 统一导入
```typescript
import {
  DatabaseIntrospector,
  createPostGraphileConfig,
  SubscriptionManager,
  ServerManager,
  WelcomePageConfig,
} from './plugins';
```

### 典型使用流程
1. **数据库扫描**: 使用 `DatabaseIntrospector` 获取表结构
2. **订阅配置**: 通过 `SubscriptionManager` 加载插件
3. **配置生成**: 使用 `createPostGraphileConfig` 创建配置
4. **服务器启动**: 通过 `ServerManager` 管理服务器生命周期

## 🎯 设计优势

### 模块化设计
- 每个插件职责单一明确
- 便于单独测试和维护
- 支持独立升级和替换

### 类型安全
- 完整的 TypeScript 支持
- 接口定义清晰
- 编译时错误检查

### 可扩展性
- 插件化架构易于扩展
- 支持自定义插件开发
- 配置灵活可调整

### 错误处理
- 优雅的错误降级
- 详细的日志输出
- 故障隔离保护

## 📈 扩展指南

### 添加新插件
1. 在 `plugins/` 目录创建新文件
2. 导出主要接口和类
3. 在 `index.ts` 中添加导出
4. 更新主入口文件使用

### 自定义配置
- 通过环境变量传递配置
- 使用接口定义配置结构
- 支持运行时动态配置

### 插件集成
- 遵循统一的错误处理模式
- 使用一致的日志格式
- 保持接口兼容性

这种架构让 GraphQL 服务器更加模块化、可维护，并为未来的功能扩展提供了坚实的基础。 