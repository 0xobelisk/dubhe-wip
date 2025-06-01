"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWelcomePage = createWelcomePage;
// 创建自定义欢迎页面
function createWelcomePage(tables, config) {
    const { port, graphqlEndpoint, nodeEnv, schema, enableCors, enableSubscriptions, } = config;
    const tableList = tables
        .map(table => {
        const keyFields = table.fields
            .filter(f => f.is_key)
            .map(f => f.field_name);
        const valueFields = table.fields
            .filter(f => !f.is_key)
            .map(f => f.field_name);
        return `
			<div class="table-info">
				<h3>📊 ${table.table_name}</h3>
				<div class="fields">
					<div><strong>键字段:</strong> ${keyFields.join(', ') || '无'}</div>
					<div><strong>值字段:</strong> ${valueFields.join(', ')}</div>
				</div>
			</div>
		`;
    })
        .join('');
    return `
		<!DOCTYPE html>
		<html>
			<head>
				<title>🚀 Sui Indexer GraphQL API</title>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					body { 
						font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
						margin: 0; 
						padding: 20px; 
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						color: #333;
						min-height: 100vh;
					}
					.container { 
						max-width: 1200px; 
						margin: 0 auto; 
						background: white; 
						padding: 40px; 
						border-radius: 16px; 
						box-shadow: 0 20px 40px rgba(0,0,0,0.1);
					}
					h1 { 
						color: #2c3e50; 
						text-align: center; 
						margin-bottom: 10px; 
						font-size: 2.5em;
					}
					.subtitle {
						text-align: center;
						color: #7f8c8d;
						margin-bottom: 40px;
						font-size: 1.2em;
					}
					.link { 
						display: inline-block; 
						margin: 10px; 
						padding: 15px 25px; 
						background: linear-gradient(135deg, #74b9ff, #0984e3); 
						color: white; 
						text-decoration: none; 
						border-radius: 8px; 
						text-align: center; 
						font-weight: 500;
						transition: transform 0.2s ease;
					}
					.link:hover { 
						transform: translateY(-2px);
						box-shadow: 0 8px 15px rgba(116, 185, 255, 0.4);
					}
					.status { 
						color: #00b894; 
						font-weight: bold; 
						text-align: center;
						font-size: 1.1em;
						margin: 20px 0;
					}
					.warning {
						background: #ffeaa7;
						border-left: 4px solid #fdcb6e;
						padding: 15px;
						margin: 20px 0;
						border-radius: 4px;
					}
					.warning h4 {
						margin-top: 0;
						color: #e17055;
					}
					.table-info {
						background: #f8f9fa;
						padding: 20px;
						margin: 15px 0;
						border-radius: 8px;
						border-left: 4px solid #74b9ff;
					}
					.table-info h3 {
						margin: 0 0 10px 0;
						color: #2c3e50;
					}
					.fields div {
						margin: 5px 0;
						color: #555;
					}
					.info-grid {
						display: grid;
						grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
						gap: 20px;
						margin: 30px 0;
					}
					.info-card {
						background: #f8f9fa;
						padding: 20px;
						border-radius: 8px;
						border: 1px solid #e9ecef;
					}
					.info-card h3 {
						color: #495057;
						margin-top: 0;
					}
					.center {
						text-align: center;
					}
					.highlight {
						background: linear-gradient(135deg, #fdcb6e, #e17055);
						color: white;
						padding: 2px 8px;
						border-radius: 4px;
						font-weight: 500;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<h1>🚀 Sui Indexer GraphQL API</h1>
					<p class="subtitle">动态扫描数据库，自动生成 GraphQL API</p>
					<p class="status">● 服务器状态：正常运行 | 已扫描 <span class="highlight">${tables.length}</span> 个表</p>
					
					${enableSubscriptions === 'false'
        ? `
					<div class="warning">
						<h4>⚠️ WebSocket 订阅功能已临时禁用</h4>
						<p>正在修复 subscription 配置问题。基本的 GraphQL 查询和变更功能完全正常。</p>
					</div>
					`
        : `
					<div class="status">
						<p>📡 实时订阅功能：${enableSubscriptions === 'true' ? '已启用' : '已禁用'}</p>
					</div>
					`}
					
					<div class="center">
						<a href="${graphqlEndpoint}" class="link">📊 GraphQL API</a>
						<a href="/graphiql" class="link">🎮 增强版 GraphQL Playground</a>
					</div>

					<div class="info-grid">
						<div class="info-card">
							<h3>🎯 核心特性</h3>
							<ul>
								<li>✨ 自动扫描 sui-rust-indexer 数据库</li>
								<li>🔄 动态生成 GraphQL schema</li>
								<li>📡 支持实时订阅功能 ${enableSubscriptions === 'true' ? '✅' : '⚠️'}</li>
								<li>🚀 完整的 CRUD 操作</li>
								<li>🛡️ PostGraphile 强大功能</li>
							</ul>
						</div>
						
						<div class="info-card">
							<h3>📊 服务器信息</h3>
							<ul>
								<li>环境: ${nodeEnv}</li>
								<li>端口: ${port}</li>
								<li>数据库模式: ${schema}</li>
								<li>CORS: ${enableCors === 'true' ? '启用' : '禁用'}</li>
								<li>订阅: ${enableSubscriptions === 'true' ? '启用' : '禁用'}</li>
							</ul>
						</div>
					</div>

					<h2>📋 检测到的数据表</h2>
					${tableList}
					
					<div style="margin-top: 40px; padding: 20px; background: #e3f2fd; border-radius: 8px;">
						<h3>💡 使用提示</h3>
						<p>1. 访问 <strong>增强版 GraphQL Playground</strong> 享受更好的查询体验</p>
						<p>   • 📊 可视化 Schema Explorer - 点击式查询构建</p>
						<p>   • 🎨 现代化 UI 界面和增强的代码高亮</p>
						<p>   • 📝 代码导出功能 - 生成多种语言的客户端代码</p>
						<p>   • ⌨️ 快捷键支持 - Ctrl/Cmd+Enter 执行查询</p>
						<p>2. 所有表都支持标准的 GraphQL 查询、变更${enableSubscriptions === 'true' ? '和订阅' : ''}操作</p>
						<p>3. 动态表（store_*）会根据 table_fields 元数据自动生成字段</p>
						<p>4. 系统表提供 sui-indexer 的核心数据访问</p>
						${enableSubscriptions === 'true'
        ? '<p>5. 使用 WebSocket 进行实时数据订阅</p>'
        : ''}
					</div>
				</div>
			</body>
		</html>
	`;
}
//# sourceMappingURL=welcome-page.js.map