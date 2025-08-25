import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface BackupInfo {
  path: string;
  filename: string;
  timestamp: string;
  size: number;
  date_formatted: string;
}

interface MachineIds {
  "telemetry.devDeviceId": string;
  "telemetry.macMachineId": string;
  "telemetry.machineId": string;
  "telemetry.sqmId": string;
  "storage.serviceMachineId": string;
}

interface RestoreResult {
  success: boolean;
  message: string;
  details: string[];
}

function App() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<MachineIds | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursorInstalled, setCursorInstalled] = useState<boolean | null>(null);
  const [cursorPaths, setCursorPaths] = useState<[string, string] | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(
    null
  );
  const [currentStep, setCurrentStep] = useState<
    "check" | "select" | "preview" | "confirm" | "result"
  >("check");

  useEffect(() => {
    checkCursorInstallation();
  }, []);

  const checkCursorInstallation = async () => {
    try {
      setLoading(true);
      const installed = await invoke<boolean>("check_cursor_installation");
      setCursorInstalled(installed);

      if (installed) {
        const paths = await invoke<[string, string]>("get_cursor_paths");
        setCursorPaths(paths);
        await loadBackups();
        setCurrentStep("select");
      }
    } catch (error) {
      console.error("Error checking Cursor installation:", error);
      setCursorInstalled(false);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const backupList = await invoke<BackupInfo[]>("get_available_backups");
      setBackups(backupList);
    } catch (error) {
      console.error("Error loading backups:", error);
    }
  };

  const selectBackup = async (backup: BackupInfo) => {
    try {
      setLoading(true);
      setSelectedBackup(backup);
      const ids = await invoke<MachineIds>("extract_backup_ids", {
        backupPath: backup.path,
      });
      setSelectedIds(ids);
      setCurrentStep("preview");
    } catch (error) {
      console.error("Error extracting IDs from backup:", error);
      alert("无法从备份中提取机器ID信息");
    } finally {
      setLoading(false);
    }
  };

  const confirmRestore = () => {
    setCurrentStep("confirm");
  };

  const executeRestore = async () => {
    if (!selectedBackup) return;

    try {
      setLoading(true);
      const result = await invoke<RestoreResult>("restore_machine_ids", {
        backupPath: selectedBackup.path,
      });
      setRestoreResult(result);
      setCurrentStep("result");
    } catch (error) {
      console.error("Error restoring machine IDs:", error);
      setRestoreResult({
        success: false,
        message: `恢复过程中发生错误: ${error}`,
        details: [],
      });
      setCurrentStep("result");
    } finally {
      setLoading(false);
    }
  };

  const resetProcess = () => {
    setSelectedBackup(null);
    setSelectedIds(null);
    setRestoreResult(null);
    setCurrentStep("select");
    loadBackups();
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024).toFixed(1) + " KB";
  };

  if (loading && currentStep === "check") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">正在检查 Cursor 安装...</p>
        </div>
      </div>
    );
  }

  if (cursorInstalled === false) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            未找到 Cursor
          </h1>
          <p className="text-gray-600 mb-6">
            系统中未检测到 Cursor 编辑器的安装。请确保已正确安装 Cursor。
          </p>
          <button
            onClick={checkCursorInstallation}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
          >
            重新检查
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-6">
        <h1 className="text-3xl font-bold text-center">
          Cursor 机器ID 恢复工具
        </h1>
        <p className="text-center mt-2 text-blue-100">
          恢复之前备份的 Cursor 机器标识
        </p>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Current Cursor Paths Info */}
        {cursorPaths && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              📁 Cursor 配置路径
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-gray-700">存储文件:</p>
                <code className="bg-gray-100 p-2 rounded block mt-1 break-all">
                  {cursorPaths[0]}
                </code>
              </div>
              <div>
                <p className="font-medium text-gray-700">数据库文件:</p>
                <code className="bg-gray-100 p-2 rounded block mt-1 break-all">
                  {cursorPaths[1]}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Select Backup */}
        {currentStep === "select" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              💾 选择备份文件
            </h2>

            {backups.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
                <p className="text-gray-600">未找到任何备份文件</p>
                <button
                  onClick={loadBackups}
                  className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
                >
                  刷新
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {backups.map((backup, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => selectBackup(backup)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-gray-800">
                          {backup.filename}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {backup.date_formatted} •{" "}
                          {formatFileSize(backup.size)}
                        </p>
                      </div>
                      <div className="text-blue-500">→</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview IDs */}
        {currentStep === "preview" && selectedIds && selectedBackup && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              🔍 预览机器ID信息
            </h2>

            <div className="mb-6">
              <h3 className="font-medium text-gray-700 mb-2">选中的备份:</h3>
              <div className="bg-gray-100 p-3 rounded">
                <p className="font-medium">{selectedBackup.filename}</p>
                <p className="text-sm text-gray-600">
                  {selectedBackup.date_formatted}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">将要恢复的机器ID:</h3>

              {Object.entries(selectedIds).map(([key, value]) => (
                <div key={key} className="border-l-4 border-blue-500 pl-4 py-2">
                  <p className="font-mono text-sm text-gray-600">{key}</p>
                  <p className="font-mono text-green-600 break-all">
                    {value || "(空)"}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setCurrentStep("select")}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded transition-colors"
              >
                返回
              </button>
              <button
                onClick={confirmRestore}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded transition-colors"
              >
                继续恢复
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {currentStep === "confirm" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-orange-600">
              ⚠️ 确认恢复操作
            </h2>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-yellow-800 mb-2">重要提醒:</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• 此操作将覆盖当前的机器ID设置</li>
                <li>• 系统会自动创建当前配置的备份</li>
                <li>• 恢复后需要重启 Cursor 编辑器</li>
                <li>• 某些系统级操作可能需要管理员权限</li>
              </ul>
            </div>

            <p className="text-gray-600 mb-6">
              确定要从备份 <strong>{selectedBackup?.filename}</strong>{" "}
              恢复机器ID吗？
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep("preview")}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={executeRestore}
                disabled={loading}
                className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-6 py-2 rounded transition-colors"
              >
                {loading ? "恢复中..." : "确认恢复"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {currentStep === "result" && restoreResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              {restoreResult.success ? "✅ 恢复完成" : "❌ 恢复失败"}
            </h2>

            <div
              className={`p-4 rounded-lg mb-6 ${
                restoreResult.success
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <p
                className={`font-medium ${
                  restoreResult.success ? "text-green-800" : "text-red-800"
                }`}
              >
                {restoreResult.message}
              </p>
            </div>

            {restoreResult.details.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium text-gray-700 mb-3">详细信息:</h3>
                <div className="space-y-2">
                  {restoreResult.details.map((detail, index) => (
                    <div
                      key={index}
                      className="bg-gray-100 p-3 rounded text-sm"
                    >
                      {detail}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {restoreResult.success && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-800 mb-2">下一步:</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• 关闭 Cursor 编辑器（如果正在运行）</li>
                  <li>• 重新启动 Cursor 编辑器</li>
                  <li>• 检查编辑器是否正常工作</li>
                </ul>
              </div>
            )}

            <button
              onClick={resetProcess}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded transition-colors"
            >
              返回首页
            </button>
          </div>
        )}

        {loading && currentStep !== "check" && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">处理中...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
