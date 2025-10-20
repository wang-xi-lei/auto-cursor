import React, { useState, useEffect } from "react";
import { CursorService } from "../services/cursorService";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { LogToolbar } from "../features/logs/LogToolbar";
import { LogTable } from "../features/logs/LogTable";
import { parseLogs } from "../features/logs/parseLogs";
import { LogEntry, LogLevel } from "../features/logs/types";

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);


  const logLevels: LogLevel[] = ["ALL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"];

  const loadLogs = async (isRetry = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // 调用 CursorService 读取日志
      const logContent = await CursorService.readLogFile();
      
      if (!logContent || logContent.trim() === "") {
        console.log("日志文件为空或不存在");
        setLogs([]);
        setError("日志文件为空或不存在");
        return;
      }
      
      const parsedLogs: LogEntry[] = parseLogs(logContent);
      setLogs(parsedLogs);
      setRetryCount(0); // 成功后重置重试计数
      console.log(`成功加载 ${parsedLogs.length} 条日志`);
    } catch (error) {
      console.error("加载日志失败:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      setLogs([]);
      
      // 自动重试机制（最多3次）
      if (!isRetry && retryCount < 3) {
        console.log(`自动重试加载日志 (${retryCount + 1}/3)`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => loadLogs(true), 1000 * (retryCount + 1)); // 递增延迟
      } else if (!isRetry) {
        // 只在非自动重试时显示 alert
        alert(`加载日志失败: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);


  // 过滤
  useEffect(() => {
    let filtered = logs;

    if (selectedLevel !== "ALL") {
      filtered = filtered.filter((log) => log.level.toUpperCase() === selectedLevel);
    }


    setDisplayLogs(filtered);
  }, [logs, selectedLevel]);



  const handleClearLogs = async () => {
    if (window.confirm("确定要清空日志吗？此操作不可恢复！")) {
      try {
        setLoading(true);
        await CursorService.clearLogFile();
        setLogs([]);
        setError(null);
        alert("日志已清空");
      } catch (error) {
        console.error("清空日志失败:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        setError(`清空日志失败: ${errorMsg}`);
        alert(`清空日志失败: ${errorMsg}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExportLogs = async () => {
    try {
      const logPath = await CursorService.getLogFilePath();
      await CursorService.openLogDirectory();
      alert(`日志文件路径: ${logPath}\n已打开日志目录`);
      setError(null);
    } catch (error) {
      console.error("导出日志失败:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(`导出日志失败: ${errorMsg}`);
      alert(`导出日志失败: ${errorMsg}`);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <LogToolbar
        levels={logLevels}
        selectedLevel={selectedLevel}
        onLevelChange={(lvl) => setSelectedLevel(lvl)}
        onRefresh={loadLogs}
        onExport={handleExportLogs}
        onClear={handleClearLogs}
      />

      <div className="flex-1 min-h-0 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-[#0b1220]">
        {loading ? (
          <div className="h-full flex items-center justify-center p-6">
            <LoadingSpinner message="加载日志中..." />
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl mb-4 text-red-500">⚠️</div>
            <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">加载错误</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <div className="flex gap-2">
              <button
                onClick={() => loadLogs()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                重试
              </button>
              <button
                onClick={() => setError(null)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-2">📋</div>
            <p>暂无日志数据</p>
            {retryCount > 0 && (
              <p className="text-sm mt-2 text-orange-600 dark:text-orange-400">
                已重试 {retryCount} 次
              </p>
            )}
          </div>
        ) : (
          <LogTable
            logs={displayLogs}
            onCopyLine={copyToClipboard}
            containerProps={{
              className: "h-full overflow-y-auto",
            }}
          />
        )}
      </div>
    </div>
  );
};
