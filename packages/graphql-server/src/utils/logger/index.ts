import pino from 'pino';
import path from 'path';
import fs from 'fs';

export interface LoggerConfig {
  level?: string;
  service?: string;
  component?: string;
  enableFileLogging?: boolean;
  logsDir?: string;
}

export interface ComponentLoggerMethods {
  debug: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, error?: any, meta?: any) => void;
}

/**
 * 基于Pino的高性能日志系统
 */
export class Logger {
  private pinoInstance: pino.Logger;
  private config: Required<LoggerConfig>;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level || process.env.LOG_LEVEL || 'info',
      service: config.service || 'dubhe-graphql-server',
      component: config.component || 'default',
      enableFileLogging: config.enableFileLogging !== false,
      logsDir: config.logsDir || path.join(process.cwd(), 'logs')
    };

    this.ensureLogsDirectory();
    this.pinoInstance = this.createPinoInstance();
    this.setupExceptionHandlers();
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogsDirectory(): void {
    if (this.config.enableFileLogging && !fs.existsSync(this.config.logsDir)) {
      fs.mkdirSync(this.config.logsDir, { recursive: true });
    }
  }

  /**
   * 创建Pino实例
   */
  private createPinoInstance(): pino.Logger {
    const pinoOptions: pino.LoggerOptions = {
      level: this.config.level,
      base: {
        service: this.config.service,
        pid: process.pid
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label: string) {
          return { level: label };
        }
      },
      serializers: {
        error: pino.stdSerializers.err
      }
    };

    // 如果启用文件日志，使用multistream
    if (this.config.enableFileLogging) {
      const streams = [
        // Pretty打印到控制台
        {
          stream: pino.transport({
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname,service,component',
              messageFormat: '[{component}]: {msg}',
              singleLine: true,
              hideObject: false
            }
          })
        },
        // JSON格式到文件
        {
          stream: pino.destination({
            dest: path.join(this.config.logsDir, 'combined.log'),
            sync: false
          })
        }
      ];

      return pino(pinoOptions, pino.multistream(streams));
    }

    // 只输出到控制台的pretty格式
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname,service',
          messageFormat: '[{component}]: {msg}',
          singleLine: true,
          hideObject: false
        }
      }
    });
  }

  /**
   * 设置异常处理器
   */
  private setupExceptionHandlers(): void {
    process.on('uncaughtException', (error) => {
      this.pinoInstance.fatal({ error }, 'Uncaught Exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.pinoInstance.fatal({ reason, promise }, 'Unhandled Promise Rejection');
      process.exit(1);
    });
  }

  /**
   * 创建带组件上下文的logger
   */
  public createComponentLogger(component: string): ComponentLoggerMethods {
    const componentLogger = this.pinoInstance.child({ component });

    return {
      debug: (message: string, meta?: any) => componentLogger.debug(meta || {}, message),
      info: (message: string, meta?: any) => componentLogger.info(meta || {}, message),
      warn: (message: string, meta?: any) => componentLogger.warn(meta || {}, message),
      error: (message: string, error?: any, meta?: any) => {
        const errorData =
          error instanceof Error
            ? {
                error: {
                  message: error.message,
                  stack: error.stack,
                  name: error.name
                },
                ...meta
              }
            : { error, ...meta };
        componentLogger.error(errorData, message);
      }
    };
  }

  /**
   * 获取原始Pino实例
   */
  public getPinoInstance(): pino.Logger {
    return this.pinoInstance;
  }

  /**
   * 记录性能指标
   */
  public logPerformance(operation: string, startTime: number, meta?: any): void {
    const duration = Date.now() - startTime;
    const perfLogger = this.createComponentLogger('performance');
    perfLogger.info(operation, {
      duration: `${duration}ms`,
      ...meta
    });
  }

  /**
   * 记录Express HTTP请求
   */
  public logExpress(
    method: string,
    path: string,
    statusCode: number,
    startTime: number,
    meta?: any
  ): void {
    const duration = Date.now() - startTime;
    const httpLogger = this.createComponentLogger('express');
    const message = `${method} ${path} - ${statusCode} (${duration}ms)`;

    // 根据状态码选择日志级别
    if (statusCode >= 500) {
      httpLogger.error(message, meta);
    } else if (statusCode >= 400) {
      httpLogger.warn(message, meta);
    } else {
      httpLogger.info(message, meta);
    }
  }

  /**
   * 记录数据库操作
   */
  public logDatabaseOperation(operation: string, table?: string, meta?: any): void {
    const dbLogger = this.createComponentLogger('database');
    dbLogger.info(`Database operation: ${operation}`, {
      table,
      ...meta
    });
  }

  /**
   * 记录WebSocket事件
   */
  public logWebSocketEvent(event: string, clientCount?: number, meta?: any): void {
    const wsLogger = this.createComponentLogger('websocket');
    wsLogger.info(`WebSocket event: ${event}`, {
      clientCount,
      ...meta
    });
  }

  /**
   * 记录GraphQL查询
   */
  public logGraphQLQuery(operation: string, query?: string, variables?: any): void {
    const gqlLogger = this.createComponentLogger('graphql');
    gqlLogger.info(`GraphQL ${operation}`, {
      query: query?.substring(0, 200) + (query && query.length > 200 ? '...' : ''),
      variableCount: variables ? Object.keys(variables).length : 0
    });
  }
}

// 创建默认logger实例
const defaultLogger = new Logger();

// 导出预定义的组件logger（保持向后兼容）
export const dbLogger = defaultLogger.createComponentLogger('database');
export const serverLogger = defaultLogger.createComponentLogger('server');
export const httpLogger = defaultLogger.createComponentLogger('express');
export const wsLogger = defaultLogger.createComponentLogger('websocket');
export const gqlLogger = defaultLogger.createComponentLogger('graphql');
export const subscriptionLogger = defaultLogger.createComponentLogger('subscription');
export const systemLogger = defaultLogger.createComponentLogger('system');
export const authLogger = defaultLogger.createComponentLogger('auth');
export const perfLogger = defaultLogger.createComponentLogger('performance');

// 导出工具函数（保持向后兼容）
export const createComponentLogger = (component: string) =>
  defaultLogger.createComponentLogger(component);

export const logPerformance = (operation: string, startTime: number, meta?: any) =>
  defaultLogger.logPerformance(operation, startTime, meta);

export const logExpress = (
  method: string,
  path: string,
  statusCode: number,
  startTime: number,
  meta?: any
) => defaultLogger.logExpress(method, path, statusCode, startTime, meta);

export const logDatabaseOperation = (operation: string, table?: string, meta?: any) =>
  defaultLogger.logDatabaseOperation(operation, table, meta);

export const logWebSocketEvent = (event: string, clientCount?: number, meta?: any) =>
  defaultLogger.logWebSocketEvent(event, clientCount, meta);

export const logGraphQLQuery = (operation: string, query?: string, variables?: any) =>
  defaultLogger.logGraphQLQuery(operation, query, variables);

// 默认导出（保持向后兼容）
export default defaultLogger.getPinoInstance();
