import React, { useMemo } from "react";
import { LogEntry, LOG_LEVEL_COLORS } from "./types";
import { formatTimestamp, generateLogLineText } from "./utils";

interface LogTableProps {
  logs: LogEntry[];
  onCopyLine: (text: string) => void;
  containerProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> };
}

function getLevelColor(level: string): string {
  const upperLevel = level.toUpperCase();
  return LOG_LEVEL_COLORS[upperLevel] || "text-slate-800 dark:text-slate-200";
}

export const LogTable: React.FC<LogTableProps> = ({ logs, onCopyLine, containerProps }) => {
  const rows = useMemo(() => logs, [logs]);

  return (
    <div {...containerProps}>
      {/* Rows */}
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((log, i) => {
          const timeStr = formatTimestamp(log.timestamp);
          const lineText = generateLogLineText(log);

          return (
            <div
              key={i}
              className="group px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/60 transition-colors"
            >
              <div className={`flex items-start font-mono whitespace-pre-wrap break-words gap-2`}>
                <span className="flex-1 min-w-0 text-[13px] leading-6">
                  <span className="text-slate-600 dark:text-slate-400">[{timeStr}]</span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                    [{log.level}]
                  </span>
                  <span className="ml-2 text-slate-800 dark:text-slate-200">{log.message}</span>
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
