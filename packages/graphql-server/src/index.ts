import { createServer } from 'http';
import { postgraphile } from 'postgraphile';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const {
	DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
	PORT = 4000,
	NODE_ENV = 'development',
	GRAPHQL_ENDPOINT = '/graphql',
	PLAYGROUND_ENDPOINT = '/playground',
	DISABLE_DEFAULT_MUTATIONS = 'false',
	ENABLE_CORS = 'true',
	WATCH_PG = 'true',
} = process.env;

// 创建数据库连接池
const pgPool = new Pool({
	connectionString: DATABASE_URL,
});

// 创建 PostGraphile 中间件
const postgraphileMiddleware = postgraphile(
	pgPool,
	process.env.PG_SCHEMA || 'public',
	{
		// 启用 GraphiQL（PostGraphile 内置的查询界面）
		graphiql: true,

		// 启用查询界面的增强功能
		enhanceGraphiql: true,

		// 监听数据库变化（开发环境）
		watchPg: NODE_ENV === 'development' && WATCH_PG === 'true',

		// 显示错误详情（开发环境）
		showErrorStack: NODE_ENV === 'development',
		extendedErrors:
			NODE_ENV === 'development' ? ['hint', 'detail', 'errcode'] : [],

		// 禁用默认的 mutations（可选）
		disableDefaultMutations: DISABLE_DEFAULT_MUTATIONS === 'true',

		// 启用实时功能
		subscriptions: true,
		live: true,

		// 允许解释查询计划
		allowExplain: NODE_ENV === 'development',

		// 启用查询缓存
		enableQueryBatching: true,

		// 自定义 GraphQL 端点
		graphqlRoute: GRAPHQL_ENDPOINT,
		graphiqlRoute: '/graphiql',

		// CORS 配置
		enableCors: ENABLE_CORS === 'true',

		// 自定义模式配置
		dynamicJson: true,
		setofFunctionsContainNulls: false,
		ignoreRBAC: false,
		ignoreIndexes: false,

		// 导出模式选项
		exportGqlSchemaPath:
			NODE_ENV === 'development' ? 'schema.graphql' : undefined,

		// 注释掉自定义错误处理，因为它与其他错误选项冲突
		// handleErrors: (errors: readonly any[]) => {
		//   console.error('GraphQL Errors:', errors);
		//   return errors;
		// },
	}
);

// 创建一个简单的 Yoga Playground HTML 页面
const createYogaPlaygroundHTML = () => `
<!DOCTYPE html>
<html>
	<head>
		<title>GraphQL Yoga Playground</title>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="shortcut icon" href="https://github.com/prisma/graphql-playground/blob/master/packages/graphql-playground-react/src/assets/favicon.png?raw=true">
		<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css">
	</head>
	<body>
		<div id="root">
			<style>
				body { margin: 0; font-family: "Open Sans", sans-serif; background: #e1e8ed; }
				#root { height: 100vh; }
				.loading { 
					display: flex; 
					justify-content: center; 
					align-items: center; 
					height: 100vh; 
					font-size: 18px; 
					color: #333; 
				}
			</style>
			<div class="loading">🎮 正在加载 GraphQL Playground...</div>
		</div>
		<script src="//cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
		<script>
			window.addEventListener('load', function (event) {
				GraphQLPlayground.init(document.getElementById('root'), {
					endpoint: '${GRAPHQL_ENDPOINT}',
					settings: {
						'general.betaUpdates': false,
						'editor.theme': 'dark',
						'editor.reuseHeaders': true,
						'tracing.hideTracingResponse': false,
						'queryPlan.hideQueryPlanResponse': false,
						'editor.fontSize': 14,
						'editor.fontFamily': '"Source Code Pro", "Consolas", "Inconsolata", "Droid Sans Mono", "Monaco", monospace',
						'request.credentials': 'omit',
					},
					workspaceName: 'PostGraphile API'
				})
			})
		</script>
	</body>
</html>
`;

// 创建 HTTP 服务器
const server = createServer(async (req, res) => {
	const url = req.url || '';

	try {
		// 路由处理
		if (url.startsWith('/graphiql') || url === '/graphiql/') {
			// PostGraphile 的 GraphiQL 界面
			return postgraphileMiddleware(req, res);
		} else if (
			url.startsWith(PLAYGROUND_ENDPOINT) ||
			url === PLAYGROUND_ENDPOINT + '/'
		) {
			// 自定义的 Yoga Playground 界面
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(createYogaPlaygroundHTML());
			return;
		} else if (
			url.startsWith(GRAPHQL_ENDPOINT) ||
			url === GRAPHQL_ENDPOINT + '/'
		) {
			// 主要的 GraphQL API 使用 PostGraphile
			return postgraphileMiddleware(req, res);
		} else if (url === '/' || url === '') {
			// 根路径返回欢迎信息
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(`
				<!DOCTYPE html>
				<html>
					<head>
						<title>GraphQL Server</title>
						<meta charset="utf-8">
						<style>
							body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
							.container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
							h1 { color: #333; }
							.link { display: block; margin: 10px 0; padding: 10px; background: #007acc; color: white; text-decoration: none; border-radius: 4px; text-align: center; }
							.link:hover { background: #005a9e; }
							.description { color: #666; margin: 10px 0; }
							.status { color: #28a745; font-weight: bold; }
						</style>
					</head>
					<body>
						<div class="container">
							<h1>🚀 GraphQL Server 运行中</h1>
							<p class="description">欢迎使用定制的 PostGraphile + Yoga GraphQL 服务器！</p>
							<p class="status">● 服务器状态：正常运行</p>
							
							<h2>📊 可用端点：</h2>
							<a href="${GRAPHQL_ENDPOINT}" class="link">GraphQL API</a>
							<p class="description">主要的 GraphQL API 端点（PostGraphile）</p>
							
							<a href="/graphiql" class="link">PostGraphile GraphiQL</a>
							<p class="description">PostGraphile 内置的增强查询界面</p>
							
							<a href="${PLAYGROUND_ENDPOINT}" class="link">GraphQL Playground</a>
							<p class="description">现代化的 GraphQL 查询界面（类似 Yoga Playground）</p>
							
							<h2>ℹ️ 服务器信息：</h2>
							<ul>
								<li>环境: ${NODE_ENV}</li>
								<li>端口: ${PORT}</li>
								<li>数据库模式: ${process.env.PG_SCHEMA || 'public'}</li>
								<li>CORS: ${ENABLE_CORS === 'true' ? '启用' : '禁用'}</li>
							</ul>
							
							<h2>🛠️ 特性：</h2>
							<ul>
								<li>✨ PostGraphile 自动生成的 GraphQL API</li>
								<li>🎮 两种现代化的查询界面</li>
								<li>🚀 实时订阅支持</li>
								<li>🔒 CORS 和认证支持</li>
								<li>📊 查询批处理和缓存</li>
								<li>🔍 开发工具和错误追踪</li>
							</ul>
						</div>
					</body>
				</html>
			`);
		} else {
			// 404 处理
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not Found');
		}
	} catch (error) {
		console.error('❌ 请求处理错误:', error);
		res.writeHead(500, { 'Content-Type': 'text/plain' });
		res.end('Internal Server Error');
	}
});

// 启动服务器
const startServer = async (): Promise<void> => {
	try {
		// 测试数据库连接
		await pgPool.query('SELECT NOW() as current_time');
		console.log('✅ 数据库连接成功');

		// 启动服务器
		server.listen(PORT, () => {
			console.log('🚀 GraphQL 服务器启动成功！');
			console.log('');
			console.log(`📍 服务器地址: http://localhost:${PORT}`);
			console.log(
				`📊 GraphQL API: http://localhost:${PORT}${GRAPHQL_ENDPOINT}`
			);
			console.log(
				`🎮 GraphQL Playground: http://localhost:${PORT}${PLAYGROUND_ENDPOINT}`
			);
			console.log(
				`🔧 PostGraphile GraphiQL: http://localhost:${PORT}/graphiql`
			);
			console.log('');
			console.log(`📝 环境: ${NODE_ENV}`);
			console.log(`🗄️  数据库模式: ${process.env.PG_SCHEMA || 'public'}`);
			console.log(`🔒 CORS: ${ENABLE_CORS === 'true' ? '启用' : '禁用'}`);
			console.log('');
			console.log('按 Ctrl+C 停止服务器');
		});
	} catch (error) {
		console.error('❌ 启动服务器失败:');
		console.error(error);
		process.exit(1);
	}
};

// 优雅关闭
process.on('SIGINT', async () => {
	console.log('\n⏹️  正在关闭服务器...');

	try {
		await pgPool.end();
		console.log('✅ 数据库连接已关闭');

		server.close(() => {
			console.log('✅ HTTP 服务器已关闭');
			console.log('👋 再见！');
			process.exit(0);
		});
	} catch (error) {
		console.error('❌ 关闭服务器时发生错误:', error);
		process.exit(1);
	}
});

// 处理未捕获的错误
process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ 未处理的 Promise 拒绝:', reason);
});

process.on('uncaughtException', error => {
	console.error('❌ 未捕获的异常:', error);
	process.exit(1);
});

// 启动应用
startServer();
