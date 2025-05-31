# GraphQL Server with PostGraphile and Yoga Playground

这是一个定制的 GraphQL 服务器，集成了 PostGraphile 和 GraphQL Yoga Playground。

## 功能特性

- ✨ **PostGraphile**: 自动从 PostgreSQL 数据库生成 GraphQL API
- 🎮 **Yoga Playground**: 现代化的 GraphQL 查询界面
- 🔧 **GraphiQL**: PostGraphile 内置的增强查询界面
- 🚀 **实时订阅**: 支持 GraphQL 订阅和实时更新
- 🔒 **CORS 支持**: 跨域资源共享配置
- 📊 **查询批处理**: 提高性能的批处理支持
- 🔍 **开发工具**: 错误追踪、查询解释等开发辅助功能

## 安装依赖

```bash
# 在项目根目录安装依赖
pnpm install

# 或者在 graphql-server 包目录下安装
cd packages/graphql-server
pnpm install
```

## 环境配置

创建 `.env` 文件并配置以下环境变量：

```env
# 数据库配置
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# 服务器配置
PORT=4000
NODE_ENV=development

# GraphQL 配置
GRAPHQL_ENDPOINT=/graphql
PLAYGROUND_ENDPOINT=/playground

# PostGraphile 选项
DISABLE_DEFAULT_MUTATIONS=false
ENABLE_CORS=true
WATCH_PG=true

# 数据库模式（可选）
PG_SCHEMA=public
```

## 使用方法

### 开发模式启动

```bash
# 开发模式（自动重启）
pnpm dev

# 或者使用 npm
npm run dev
```

### 生产模式启动

```bash
# 构建项目
pnpm build

# 启动服务器
pnpm start
```

## 可用端点

启动服务器后，您可以访问以下端点：

- **GraphQL API**: `http://localhost:4000/graphql`
- **Yoga Playground**: `http://localhost:4000/playground` 
- **PostGraphile GraphiQL**: `http://localhost:4000/graphiql`

## 数据库准备

确保您的 PostgreSQL 数据库已经创建并且可以连接。PostGraphile 会自动扫描数据库表结构并生成相应的 GraphQL schema。

### 示例数据库表

```sql
-- 创建示例表
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 插入示例数据
INSERT INTO users (name, email) VALUES 
  ('张三', 'zhangsan@example.com'),
  ('李四', 'lisi@example.com');

INSERT INTO posts (title, content, user_id) VALUES 
  ('我的第一篇文章', '这是文章内容...', 1),
  ('GraphQL 很棒', '学习 GraphQL 的心得...', 2);
```

## 自定义配置

### 添加 PostGraphile 插件

在 `src/index.ts` 中的 `appendPlugins` 数组中添加插件：

```typescript
appendPlugins: [
  // 例如：添加连接过滤插件
  require("@graphile-contrib/pg-simplify-inflector"),
  require("postgraphile-plugin-connection-filter")
],
```

### 添加 Yoga 插件

在 `src/index.ts` 中的 `plugins` 数组中添加 Yoga 插件：

```typescript
plugins: [
  // 例如：添加响应缓存插件
  useResponseCache(),
],
```

### JWT 认证

取消注释 JWT 相关配置并设置环境变量：

```typescript
jwtPgTypeIdentifier: 'public.jwt_token',
jwtSecret: process.env.JWT_SECRET,
```

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查 `DATABASE_URL` 是否正确
   - 确保 PostgreSQL 服务正在运行
   - 验证数据库用户权限

2. **端口已被占用**
   - 修改 `.env` 文件中的 `PORT` 值
   - 或者停止占用该端口的其他服务

3. **模块找不到错误**
   - 运行 `pnpm install` 重新安装依赖
   - 检查 `package.json` 中的依赖版本

## 性能优化

- 启用查询缓存：`enableQueryBatching: true`
- 使用连接池：已配置 `pg.Pool`
- 启用 GZIP 压缩（可通过反向代理配置）
- 设置适当的数据库索引

## 部署

### Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

### 环境变量

生产环境确保设置：
- `NODE_ENV=production`
- `DATABASE_URL` (生产数据库连接字符串)
- `JWT_SECRET` (如果使用 JWT)

## 许可证

ISC License 