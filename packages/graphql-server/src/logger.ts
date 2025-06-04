import winston from 'winston';

// 定义日志级别颜色
const colors = {
	error: 'red',
	warn: 'yellow',
	info: 'green',
	debug: 'blue',
	verbose: 'cyan',
};

winston.addColors(colors);

// 自定义格式化函数
const customFormat = winston.format.combine(
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	winston.format.errors({ stack: true }),
	winston.format.colorize({ all: true }),
	winston.format.printf((info: any) => {
		const { timestamp, level, message, service, component, ...meta } = info;
		let logMessage = `${timestamp} [${level}]`;

		// 添加服务和组件信息
		if (service) logMessage += ` [${service}]`;
		if (component) logMessage += ` [${component}]`;

		logMessage += `: ${message}`;

		// 添加额外的元数据
		if (Object.keys(meta).length > 0) {
			logMessage += ` ${JSON.stringify(meta)}`;
		}

		return logMessage;
	})
);

// 创建logger实例
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'info',
	format: customFormat,
	defaultMeta: {
		service: 'dubhe-graphql-server',
		pid: process.pid,
	},
	transports: [
		// 控制台输出
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				customFormat
			),
		}),

		// 错误日志文件
		new winston.transports.File({
			filename: 'logs/error.log',
			level: 'error',
			format: winston.format.combine(
				winston.format.timestamp(),
				winston.format.json()
			),
		}),

		// 所有日志文件
		new winston.transports.File({
			filename: 'logs/combined.log',
			format: winston.format.combine(
				winston.format.timestamp(),
				winston.format.json()
			),
		}),
	],

	// 异常处理
	exceptionHandlers: [
		new winston.transports.File({ filename: 'logs/exceptions.log' }),
	],

	// 未捕获的Promise异常
	rejectionHandlers: [
		new winston.transports.File({ filename: 'logs/rejections.log' }),
	],
});

// 创建带有组件上下文的logger
export const createComponentLogger = (component: string) => {
	return {
		debug: (message: string, meta?: any) =>
			logger.debug(message, { component, ...meta }),
		info: (message: string, meta?: any) =>
			logger.info(message, { component, ...meta }),
		warn: (message: string, meta?: any) =>
			logger.warn(message, { component, ...meta }),
		error: (message: string, error?: any, meta?: any) => {
			const errorMeta =
				error instanceof Error
					? {
							error: error.message,
							stack: error.stack,
							...meta,
					  }
					: { error, ...meta };
			logger.error(message, { component, ...errorMeta });
		},
	};
};

// 数据库相关日志
export const dbLogger = createComponentLogger('database');

// 服务器相关日志
export const serverLogger = createComponentLogger('server');

// WebSocket相关日志
export const wsLogger = createComponentLogger('websocket');

// GraphQL相关日志
export const gqlLogger = createComponentLogger('graphql');

// 订阅相关日志
export const subscriptionLogger = createComponentLogger('subscription');

// 系统日志
export const systemLogger = createComponentLogger('system');

// 认证日志
export const authLogger = createComponentLogger('auth');

// 性能日志
export const perfLogger = createComponentLogger('performance');

// 默认导出主logger
export default logger;

// 工具函数：记录性能指标
export const logPerformance = (
	operation: string,
	startTime: number,
	meta?: any
) => {
	const duration = Date.now() - startTime;
	perfLogger.info(`${operation} completed`, {
		duration: `${duration}ms`,
		...meta,
	});
};

// 工具函数：记录数据库操作
export const logDatabaseOperation = (
	operation: string,
	table?: string,
	meta?: any
) => {
	dbLogger.info(`Database operation: ${operation}`, {
		table,
		...meta,
	});
};

// 工具函数：记录WebSocket事件
export const logWebSocketEvent = (
	event: string,
	clientCount?: number,
	meta?: any
) => {
	wsLogger.info(`WebSocket event: ${event}`, {
		clientCount,
		...meta,
	});
};

// 工具函数：记录GraphQL查询
export const logGraphQLQuery = (
	operation: string,
	query?: string,
	variables?: any
) => {
	gqlLogger.info(`GraphQL ${operation}`, {
		query:
			query?.substring(0, 200) +
			(query && query.length > 200 ? '...' : ''),
		variableCount: variables ? Object.keys(variables).length : 0,
	});
};
