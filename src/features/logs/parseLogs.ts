import { LogEntry } from "./types";

// Parse log content into structured entries. Supports multiple formats.
export function parseLogs(content: string): LogEntry[] {
  if (!content || content.trim() === "") return [];

  const lines = content.split("\n").filter((l) => l.trim());
  const parsed: LogEntry[] = lines.map((line) => {
    // 1) 2025-01-18T10:30:45.123Z [INFO] message
    let match = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[\.,]?\d*)\s*\[(\w+)\]\s+(.+)$/);
    if (match) {
      return { timestamp: match[1], level: match[2].toUpperCase(), message: match[3] };
    }

    // 2) [INFO] 2025-01-18 10:30:45 message
    match = line.match(/^\[(\w+)\]\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
    if (match) {
      return { timestamp: match[2], level: match[1].toUpperCase(), message: match[3] };
    }

    // 3) [LEVEL] message
    match = line.match(/^\[(\w+)\]\s+(.+)$/);
    if (match) {
      return { timestamp: new Date().toISOString(), level: match[1].toUpperCase(), message: match[2] };
    }

    // 4) Rust format: 2025-01-18 10:30:45 INFO message
    match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\w+)\s+(.+)$/);
    if (match) {
      return { timestamp: match[1], level: match[2].toUpperCase(), message: match[3] };
    }

    // Fallback
    return { timestamp: new Date().toISOString(), level: "INFO", message: line };
  });

  // Keep original order (old -> new)
  return parsed;
}
