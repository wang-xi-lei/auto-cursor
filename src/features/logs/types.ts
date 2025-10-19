export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  module?: string;
}

export type LogLevel = "ALL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";
