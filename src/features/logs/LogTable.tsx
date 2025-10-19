import React, { useMemo } from "react";
import { LogEntry } from "./types";

interface LogTableProps {
  logs: LogEntry[];
  onCopyLine: (text: string) => void;
  containerProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> };
}

function getLevelColor(level: string): string {
  const lvl = level.toUpperCase();
  switch (lvl) {
    case "ERROR":
      return "text-red-600 dark:text-red-400";
    case "WARN":
      return "text-amber-600 dark:text-amber-300";
    case "INFO":
      return "text-blue-600 dark:text-blue-300";
    case "DEBUG":
      return "text-green-600 dark:text-green-300";
    case "TRACE":
      return "text-gray-600 dark:text-gray-400";
    default:
      return "text-slate-800 dark:text-slate-200";
  }
}

export const LogTable: React.FC<LogTableProps> = ({ logs, onCopyLine, containerProps }) => {
  const rows = useMemo(() => logs, [logs]);

  return (
    <div {...containerProps}>
      {/* Rows */}
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((log, i) => {
          const dOk = !isNaN(Date.parse(log.timestamp));
          const d = dOk ? new Date(log.timestamp) : null;
          const timeStr = d
            ? d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
            : log.timestamp;

          const lineText = `[${timeStr}] [${log.level}] ${log.message}`;

          return (
            <div
              key={i}
              className="group px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/60 transition-colors"
            >
              <div className={`flex items-start font-mono whitespace-pre-wrap break-words`}>
                <span className="flex-1 min-w-0 text-[13px] leading-6">
                  <span className="text-slate-800 dark:text-slate-200">{`[${timeStr}] [${log.level}] `}</span>
                  <span className={`${getLevelColor(log.level)}`}>{log.message}</span>
                </span>
                <span className="ml-auto pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onCopyLine(lineText)}
                    className="px-2 py-0.5 text-[11px] rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    复制
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
