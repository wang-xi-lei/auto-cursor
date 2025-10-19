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


  const logLevels: LogLevel[] = ["ALL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"];

  const loadLogs = async () => {
    try {
      setLoading(true);
      // 调用 CursorService 读取日志
      const logContent = await CursorService.readLogFile();
      
      if (!logContent || logContent.trim() === "") {
        console.log("日志文件为空或不存在");
        setLogs([]);
        return;
      }
      
      const parsedLogs: LogEntry[] = parseLogs(logContent);
      setLogs(parsedLogs);
      console.log(`成功加载 ${parsedLogs.length} 条日志`);
    } catch (error) {
      console.error("加载日志失败:", error);
      setLogs([]);
      // 显示错误提示
      alert(`加载日志失败: ${error}`);
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
        await CursorService.clearLogFile();
        setLogs([]);
        alert("日志已清空");
      } catch (error) {
        console.error("清空日志失败:", error);
        alert(`清空日志失败: ${error}`);
      }
    }
  };

  const handleExportLogs = async () => {
    try {
      const logPath = await CursorService.getLogFilePath();
      await CursorService.openLogDirectory();
      alert(`日志文件路径: ${logPath}\n已打开日志目录`);
    } catch (error) {
      console.error("导出日志失败:", error);
      alert(`导出日志失败: ${error}`);
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
        ) : displayLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-2">📋</div>
            <p>暂无日志数据</p>
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
