import React from "react";
import { LogLevel } from "./types";

interface LogToolbarProps {
  levels: LogLevel[];
  selectedLevel: LogLevel;
  onLevelChange: (level: LogLevel) => void;
  onRefresh: () => void;
  onExport: () => void;
  onClear: () => void;
}

const LEVEL_LABEL: Record<Exclude<LogLevel, "ALL"> | "ALL", string> = {
  ALL: "全部",
  ERROR: "错误",
  WARN: "警告",
  INFO: "信息",
  DEBUG: "调试",
  TRACE: "详细",
};

const LEVEL_STYLES: Record<LogLevel | "ALL", { active: string; inactive: string }> = {
  ALL: {
    active: "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100",
    inactive: "bg-transparent text-slate-700 border-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800/60",
  },
  ERROR: {
    active: "bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:border-rose-500",
    inactive: "bg-transparent text-rose-700 border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-700 dark:hover:bg-rose-900/40",
  },
  WARN: {
    active: "bg-amber-500 text-white border-amber-500 dark:bg-amber-400 dark:border-amber-400",
    inactive: "bg-transparent text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/40",
  },
  INFO: {
    active: "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500",
    inactive: "bg-transparent text-sky-700 border-sky-300 hover:bg-sky-50 dark:text-sky-300 dark:border-sky-700 dark:hover:bg-sky-900/40",
  },
  DEBUG: {
    active: "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500",
    inactive: "bg-transparent text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-700 dark:hover:bg-emerald-900/40",
  },
  TRACE: {
    active: "bg-violet-600 text-white border-violet-600 dark:bg-violet-500 dark:border-violet-500",
    inactive: "bg-transparent text-violet-700 border-violet-300 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-700 dark:hover:bg-violet-900/40",
  },
};

export const LogToolbar: React.FC<LogToolbarProps> = ({
  levels,
  selectedLevel,
  onLevelChange,
  onRefresh,
  onExport,
  onClear,
}) => {
  const allLevels: (LogLevel | "ALL")[] = ["ALL", ...levels.filter((l) => l !== "ALL")];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {allLevels.map((lvl) => {
            const active = selectedLevel === lvl;
            const cls = active ? LEVEL_STYLES[lvl as LogLevel].active : LEVEL_STYLES[lvl as LogLevel].inactive;
            return (
              <button
                key={lvl}
                onClick={() => onLevelChange(lvl as LogLevel)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${cls}`}
              >
                {LEVEL_LABEL[lvl as keyof typeof LEVEL_LABEL] ?? (lvl as string)}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={onExport} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200">
            日志目录
          </button>
          <button onClick={onRefresh} className="px-3 py-1.5 text-sm rounded-md bg-sky-600 hover:bg-sky-700 text-white">
            刷新日志
          </button>
          <button onClick={onClear} className="px-3 py-1.5 text-sm rounded-md bg-rose-600 hover:bg-rose-700 text-white">
            清空
          </button>
        </div>
      </div>

    </div>
  );
};
