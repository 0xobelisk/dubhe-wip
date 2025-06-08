#!/usr/bin/env node

/**
 * Express服务器测试脚本
 * 测试各个端点是否正常工作
 */

const http = require('http');

const PORT = process.env.PORT || 4000;
const HOST = 'localhost';

// 测试端点列表
const endpoints = [
	{ path: '/', description: '主页' },
	{ path: '/health', description: '健康检查' },
	{ path: '/playground', description: 'GraphQL Playground' },
	{ path: '/subscription-config', description: '订阅配置' },
];

// 发送HTTP请求的辅助函数
function makeRequest(path) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: HOST,
			port: PORT,
			path: path,
			method: 'GET',
			timeout: 5000,
		};

		const req = http.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					data: data.substring(0, 200), // 只显示前200个字符
				});
			});
		});

		req.on('error', (err) => {
			reject(err);
		});

		req.on('timeout', () => {
			req.destroy();
			reject(new Error('请求超时'));
		});

		req.end();
	});
}

// 主测试函数
async function testServer() {
	console.log(`🧪 开始测试Express服务器 (${HOST}:${PORT})`);
	console.log('='.repeat(60));

	let passedTests = 0;
	let totalTests = endpoints.length;

	for (const endpoint of endpoints) {
		try {
			console.log(`🔍 测试 ${endpoint.path} (${endpoint.description})`);
			
			const result = await makeRequest(endpoint.path);
			
			if (result.statusCode === 200) {
				console.log(`✅ ${endpoint.path} - 状态码: ${result.statusCode}`);
				console.log(`   内容类型: ${result.headers['content-type']}`);
				if (endpoint.path === '/health' || endpoint.path === '/subscription-config') {
					// 对于JSON端点，尝试解析响应
					try {
						const jsonData = JSON.parse(result.data);
						console.log(`   响应: ${JSON.stringify(jsonData, null, 2).substring(0, 150)}...`);
					} catch (e) {
						console.log(`   响应: ${result.data.substring(0, 100)}...`);
					}
				} else {
					console.log(`   响应长度: ${result.data.length} 字符`);
				}
				passedTests++;
			} else {
				console.log(`❌ ${endpoint.path} - 状态码: ${result.statusCode}`);
				console.log(`   响应: ${result.data}`);
			}
		} catch (error) {
			console.log(`❌ ${endpoint.path} - 错误: ${error.message}`);
		}
		
		console.log(''); // 空行分隔
	}

	console.log('='.repeat(60));
	console.log(`📊 测试结果: ${passedTests}/${totalTests} 通过`);
	
	if (passedTests === totalTests) {
		console.log('🎉 所有测试通过！Express服务器运行正常');
		process.exit(0);
	} else {
		console.log('⚠️  部分测试失败，请检查服务器状态');
		process.exit(1);
	}
}

// 检查服务器是否在运行
console.log('正在检查Express服务器是否启动...');
makeRequest('/health')
	.then(() => {
		console.log('✅ 服务器正在运行，开始测试\n');
		testServer();
	})
	.catch((error) => {
		console.log(`❌ 无法连接到服务器: ${error.message}`);
		console.log(`请确保Express服务器正在 ${HOST}:${PORT} 上运行`);
		console.log('可以使用以下命令启动服务器:');
		console.log('  pnpm dev');
		process.exit(1);
	}); 