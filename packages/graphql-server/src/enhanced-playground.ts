// 增强版 GraphQL Playground 插件
// 基于 GraphiQL 和 Explorer 插件提供更好的可视化体验

import type { IncomingMessage, ServerResponse } from 'http';

export interface PlaygroundOptions {
	url: string;
	subscriptionUrl?: string;
	title?: string;
	subtitle?: string;
}

export function createEnhancedPlayground(
	options: PlaygroundOptions
): (req: IncomingMessage, res: ServerResponse, config?: any) => string {
	return (req: IncomingMessage, res: ServerResponse, _config?: any) => {
		const {
			url,
			subscriptionUrl,
			title = 'Sui Indexer GraphQL Playground',
			subtitle = '强大的GraphQL API，自动扫描数据库表结构',
		} = options;

		// 构建GraphiQL配置选项
		const graphiqlOptions = {
			url,
			...(subscriptionUrl && { subscriptionUrl }),
			headers: {
				'Content-Type': 'application/json',
			},
		};

		return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        height: 100%;
        margin: 0;
        width: 100%;
        overflow: hidden;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }

      #graphiql {
        height: 100vh;
      }

      /* 自定义 GraphiQL 样式 */
      .graphiql-container {
        background: #f8f9fa;
      }

      /* 隐藏第二个水平滚动条 */
      :global(.graphiql-explorer-root > div:first-child) {
        overflow: hidden !important;
      }

      /* 增强顶部工具栏样式 */
      .graphiql-toolbar {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-bottom: 1px solid #e1e8ed;
      }

      .graphiql-toolbar-button {
        color: white !important;
        font-weight: 500;
      }

      /* 自定义查询编辑器样式 */
      .graphiql-query-editor {
        border-right: 1px solid #e1e8ed;
      }

      /* 增强结果面板样式 */
      .graphiql-response {
        border-left: 1px solid #e1e8ed;
      }

      /* 增强文档浏览器样式 */
      .graphiql-doc-explorer {
        background: #ffffff;
        border-left: 1px solid #e1e8ed;
      }

      .graphiql-doc-explorer-title {
        background: #f8f9fa;
        border-bottom: 1px solid #e1e8ed;
        padding: 12px 16px;
        font-weight: 600;
        color: #495057;
      }

      /* 加载动画 */
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 18px;
        font-weight: 500;
      }

      .loading::after {
        content: "...";
        animation: dots 1.5s infinite;
        margin-left: 4px;
      }

      @keyframes dots {
        0%, 20% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
      }

      /* 欢迎信息样式 */
      .welcome-banner {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 16px;
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        border-bottom: 1px solid #e1e8ed;
      }

      /* Explorer 面板增强 */
      .graphiql-explorer {
        background: #ffffff;
        border-right: 1px solid #e1e8ed;
      }

      .graphiql-explorer-root {
        background: #ffffff;
      }

      /* 增强查询历史样式 */
      .graphiql-history {
        background: #ffffff;
      }

      /* 自定义按钮样式 */
      .graphiql-execute-button {
        background: linear-gradient(135deg, #00b894, #00a085) !important;
        border: none !important;
        color: white !important;
        font-weight: 600 !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
      }

      .graphiql-execute-button:hover {
        background: linear-gradient(135deg, #00a085, #008f73) !important;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 184, 148, 0.3) !important;
      }

      /* 美化滚动条 */
      .graphiql-container ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      .graphiql-container ::-webkit-scrollbar-track {
        background: #f1f3f4;
      }

      .graphiql-container ::-webkit-scrollbar-thumb {
        background: #c1c8cd;
        border-radius: 4px;
      }

      .graphiql-container ::-webkit-scrollbar-thumb:hover {
        background: #a8b1b8;
      }
    </style>
    
    <!-- 外部依赖库 -->
    <!-- React 18 -->
    <script
      crossorigin
      src="https://unpkg.com/react@18/umd/react.production.min.js"
    ></script>
    <script
      crossorigin
      src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
    ></script>
    
    <!-- GraphiQL 核心库 -->
    <script
      src="https://unpkg.com/graphiql/graphiql.min.js"
      type="application/javascript"
    ></script>
    <link rel="stylesheet" href="https://unpkg.com/graphiql/graphiql.min.css" />
    
    <!-- GraphiQL Explorer 插件 -->
    <script
      src="https://unpkg.com/@graphiql/plugin-explorer/dist/index.umd.js"
      crossorigin
    ></script>
    <link
      rel="stylesheet"
      href="https://unpkg.com/@graphiql/plugin-explorer/dist/style.css"
    />
    
    <!-- GraphiQL Code Exporter 插件 -->
    <script
      src="https://unpkg.com/@graphiql/plugin-code-exporter/dist/index.umd.js"
      crossorigin
    ></script>
    <link
      rel="stylesheet"
      href="https://unpkg.com/@graphiql/plugin-code-exporter/dist/style.css"
    />
  </head>

  <body>
    <!-- 欢迎横幅 -->
    <div class="welcome-banner">
      🚀 ${title} | ${subtitle} | 支持实时查询和订阅
    </div>
    
    <!-- GraphiQL 容器 -->
    <div id="graphiql">
      <div class="loading">
        正在加载 GraphQL Playground
      </div>
    </div>
    
    <script>
      try {
        // 创建 React 根节点
        const root = ReactDOM.createRoot(document.getElementById('graphiql'));
        
        // 创建 GraphQL 数据获取器
        const fetcher = GraphiQL.createFetcher(${JSON.stringify(
			graphiqlOptions
		)});
        
        // 配置 Explorer 插件
        const explorerPlugin = GraphiQLPluginExplorer.explorerPlugin({
          showAttribution: true,
          hideActions: false,
          title: 'Schema Explorer',
        });
        
        // 配置代码导出插件
        const codeExporterPlugin = GraphiQLPluginCodeExporter.codeExporterPlugin({
          includeHeaders: true,
        });
        
        // 默认查询示例
        const defaultQuery = \`# 🚀 欢迎使用 Sui Indexer GraphQL API
# 
# 💡 使用左侧的 Schema Explorer 浏览可用的查询
# 📊 所有动态表（store_*）和系统表都已自动生成
# 
# 🔍 示例查询：查看所有表
query GetAllTables {
  __schema {
    queryType {
      fields {
        name
        description
        type {
          name
          kind
        }
      }
    }
  }
}

# 📡 如果启用了订阅功能，你还可以使用实时订阅
# subscription {
#   listen(topic: "table_changes") {
#     relatedNode {
#       id
#     }
#   }
# }
\`;
        
        // 渲染 GraphiQL 界面
        root.render(
          React.createElement(GraphiQL, {
            fetcher,
            defaultQuery,
            defaultEditorToolsVisibility: true,
            isHeadersEditorEnabled: true,
            shouldPersistHeaders: true,
            plugins: [explorerPlugin, codeExporterPlugin],
            toolbar: {
              additionalContent: [
                React.createElement('button', {
                  key: 'docs',
                  className: 'graphiql-toolbar-button',
                  onClick: () => {
                    window.open('/', '_blank');
                  },
                  title: '查看 API 文档和服务器信息'
                }, '📚 文档'),
                React.createElement('button', {
                  key: 'schema',
                  className: 'graphiql-toolbar-button',
                  onClick: () => {
                    const schemaUrl = '${url.replace(
						'/graphql',
						'/graphql/schema'
					)}';
                    window.open(schemaUrl, '_blank');
                  },
                  title: '下载 GraphQL Schema'
                }, '📄 Schema'),
              ]
            }
          })
        );
        
        // 添加键盘快捷键支持
        document.addEventListener('keydown', (event) => {
          // Ctrl+Enter 或 Cmd+Enter 执行查询
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            const executeButton = document.querySelector('.graphiql-execute-button');
            if (executeButton) {
              executeButton.click();
            }
          }
          
          // Ctrl+/ 或 Cmd+/ 切换注释
          if ((event.ctrlKey || event.metaKey) && event.key === '/') {
            event.preventDefault();
            // GraphiQL 内部会处理注释切换
          }
        });
        
        console.log('🎮 GraphQL Playground 加载完成');
        console.log('💡 快捷键：');
        console.log('  - Ctrl/Cmd + Enter: 执行查询');
        console.log('  - Ctrl/Cmd + /: 切换注释');
        console.log('  - Ctrl/Cmd + Space: 代码补全');
        
      } catch (error) {
        console.error('❌ GraphiQL 加载失败:', error);
        document.getElementById('graphiql').innerHTML = \`
          <div style="padding: 40px; text-align: center; font-family: monospace;">
            <h2 style="color: #e74c3c;">⚠️ GraphQL Playground 加载失败</h2>
            <p>请检查网络连接或刷新页面重试。</p>
            <p style="color: #7f8c8d; font-size: 14px;">错误详情: \${error.message}</p>
            <button onclick="window.location.reload()" 
                    style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
              🔄 重新加载
            </button>
          </div>
        \`;
      }
    </script>
  </body>
</html>`;
	};
}
