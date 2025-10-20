import { LogEntry, normalizeLogLevel } from "./types";
import { sanitizeLogs } from "./utils";

// Parse log content into structured entries. Supports multiple formats.
export function parseLogs(content: string): LogEntry[] {
  if (!content || content.trim() === "") return [];

  const lines = content.split("\n").filter((l) => l.trim());
  const parsed: LogEntry[] = lines.map((line) => {
    // 1) [2025-01-18 10:30:45.123] [INFO] message (current Rust format)
    let match = line.match(/^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.,]?\d*)\]\s*\[(\w+)\]\s+(.+)$/);
    if (match) {
      return { timestamp: match[1], level: normalizeLogLevel(match[2]), message: match[3] };
    }

    // 2) 2025-01-18T10:30:45.123Z [INFO] message
    match = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[\.,]?\d*(?:Z|[+-]\d{2}:?\d{2})?)\s*\[(\w+)\]\s+(.+)$/);
    if (match) {
      return { timestamp: match[1], level: normalizeLogLevel(match[2]), message: match[3] };
    }

    // 3) [INFO] 2025-01-18 10:30:45 message
    match = line.match(/^\[(\w+)\]\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.,]?\d*)\s+(.+)$/);
    if (match) {
      return { timestamp: match[2], level: normalizeLogLevel(match[1]), message: match[3] };
    }

    // 4) 2025-01-18 10:30:45.123 INFO message (plain format)
    match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.,]?\d*)\s+(\w+)\s+(.+)$/);
    if (match) {
      return { timestamp: match[1], level: normalizeLogLevel(match[2]), message: match[3] };
    }

    // 5) [LEVEL] message (simple format)
    match = line.match(/^\[(\w+)\]\s+(.+)$/);
    if (match) {
      return { timestamp: new Date().toISOString(), level: normalizeLogLevel(match[1]), message: match[2] };
    }

    // 6) LEVEL: message (colon format)
    match = line.match(/^(\w+):\s+(.+)$/);
    if (match) {
      return { timestamp: new Date().toISOString(), level: normalizeLogLevel(match[1]), message: match[2] };
    }

    // Fallback - treat entire line as message
    return { timestamp: new Date().toISOString(), level: "INFO", message: line };
  });

  // Keep original order (old -> new) and sanitize
  return sanitizeLogs(parsed);
}
