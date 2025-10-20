export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
}

// 统一的日志级别定义
export type LogLevel = "ALL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

// 日志级别优先级（数值越高优先级越高）
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  "ALL": 0,
  "TRACE": 10,
  "DEBUG": 20,
  "INFO": 30,
  "WARN": 40,
  "ERROR": 50,
};

// 日志级别颜色配置
export const LOG_LEVEL_COLORS: Record<string, string> = {
  "ERROR": "text-red-600 dark:text-red-400",
  "WARN": "text-amber-600 dark:text-amber-300", 
  "INFO": "text-blue-600 dark:text-blue-300",
  "DEBUG": "text-green-600 dark:text-green-300",
  "TRACE": "text-gray-600 dark:text-gray-400",
};

// 检查日志级别是否有效
export function isValidLogLevel(level: string): level is LogLevel {
  return level === "ALL" || level === "ERROR" || level === "WARN" || level === "INFO" || level === "DEBUG" || level === "TRACE";
}

// 规范化日志级别
export function normalizeLogLevel(level: string): LogLevel {
  const upperLevel = level.toUpperCase();
  return isValidLogLevel(upperLevel) ? upperLevel : "INFO";
}
