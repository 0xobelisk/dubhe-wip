#!/bin/bash

# DubheGraphqlClient 测试脚本运行器

echo "🚀 开始运行 DubheGraphqlClient 测试..."
echo ""

# 检查当前目录
if [[ ! -f "package.json" ]]; then
    echo "❌ 错误: 请在 packages/graphql-client 目录下运行此脚本"
    exit 1
fi

# 检查是否有 dubhe.config.ts
if [[ ! -f "dubhe.config.ts" ]]; then
    echo "❌ 错误: 未找到 dubhe.config.ts 文件"
    exit 1
fi

# 设置默认环境变量（如果未设置）
export GRAPHQL_ENDPOINT=${GRAPHQL_ENDPOINT:-"http://localhost:4000/graphql"}
export GRAPHQL_WS_ENDPOINT=${GRAPHQL_WS_ENDPOINT:-"ws://localhost:4000/graphql"}

echo "📋 测试配置:"
echo "  GraphQL HTTP: $GRAPHQL_ENDPOINT"
echo "  GraphQL WebSocket: $GRAPHQL_WS_ENDPOINT"
echo ""

# 检查依赖
echo "🔍 检查依赖..."

if ! command -v npx &> /dev/null; then
    echo "❌ 错误: 需要安装 npm/npx"
    exit 1
fi

# 尝试使用 tsx，如果没有则使用 ts-node
if npx tsx --version &> /dev/null; then
    echo "✅ 使用 tsx 运行测试"
    npx tsx scripts/test-queries.ts
elif npx ts-node --version &> /dev/null; then
    echo "✅ 使用 ts-node 运行测试"
    npx ts-node scripts/test-queries.ts
else
    echo "❌ 错误: 需要安装 tsx 或 ts-node"
    echo "请运行: npm install -g tsx 或 npm install -g ts-node"
    exit 1
fi

echo ""
echo "🎉 测试运行完成!" 