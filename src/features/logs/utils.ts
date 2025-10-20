import { LogEntry, LogLevel, LOG_LEVEL_PRIORITY } from "./types";

/**
 * 格式化日志时间戳
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Shanghai"
      });
    }
  } catch (e) {
    // 忽略解析错误
  }
  // 如果解析失败，返回原始字符串
  return timestamp;
}

/**
 * 过滤日志条目
 */
export function filterLogs(logs: LogEntry[], level: LogLevel): LogEntry[] {
  if (level === "ALL") return logs;
  
  const targetPriority = LOG_LEVEL_PRIORITY[level];
  return logs.filter(log => {
    const logPriority = LOG_LEVEL_PRIORITY[log.level];
    return logPriority >= targetPriority;
  });
}

/**
 * 搜索日志条目
 */
export function searchLogs(logs: LogEntry[], query: string): LogEntry[] {
  if (!query.trim()) return logs;
  
  const lowerQuery = query.toLowerCase();
  return logs.filter(log => 
    log.message.toLowerCase().includes(lowerQuery) ||
    log.level.toLowerCase().includes(lowerQuery) ||
    log.timestamp.toLowerCase().includes(lowerQuery)
  );
}

/**
 * 排序日志条目
 */
export function sortLogs(logs: LogEntry[], order: 'asc' | 'desc' = 'desc'): LogEntry[] {
  return [...logs].sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    
    if (isNaN(dateA) || isNaN(dateB)) {
      // 如果时间戳无法解析，按字符串排序
      return order === 'asc' 
        ? a.timestamp.localeCompare(b.timestamp)
        : b.timestamp.localeCompare(a.timestamp);
    }
    
    return order === 'asc' ? dateA - dateB : dateB - dateA;
  });
}

/**
 * 生成日志行文本
 */
export function generateLogLineText(log: LogEntry): string {
  const formattedTime = formatTimestamp(log.timestamp);
  return `[${formattedTime}] [${log.level}] ${log.message}`;
}

/**
 * 验证日志条目
 */
export function validateLogEntry(log: any): log is LogEntry {
  return (
    typeof log === 'object' &&
    log !== null &&
    typeof log.timestamp === 'string' &&
    typeof log.level === 'string' &&
    typeof log.message === 'string'
  );
}

/**
 * 清理无效日志条目
 */
export function sanitizeLogs(logs: any[]): LogEntry[] {
  return logs.filter(validateLogEntry);
}