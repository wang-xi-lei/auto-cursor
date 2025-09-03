import React, { useState, useEffect } from "react";
import { CursorService } from "../services/cursorService";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Button } from "../components/Button";
import { useToast, ToastManager } from "../components/Toast";
import { useConfirmDialog } from "../components/ConfirmDialog";
import {
  BackupInfo,
  MachineIds,
  RestoreResult,
  ResetResult,
} from "../types/auth";

type Step =
  | "menu"
  | "select"
  | "preview"
  | "confirm"
  | "result"
  | "reset"
  | "complete_reset"
  | "confirm_reset"
  | "confirm_complete_reset";

export const MachineIdPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>("menu");
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<MachineIds | null>(null);
  const [currentMachineIds, setCurrentMachineIds] = useState<MachineIds | null>(
    null
  );
  const [machineIdFileContent, setMachineIdFileContent] = useState<
    string | null
  >(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(
    null
  );
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  // Toast 和确认对话框
  const { toasts, removeToast, showSuccess, showError } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    loadCurrentMachineIds();
  }, []);

  const loadCurrentMachineIds = async () => {
    try {
      setLoading(true);
      const [ids, content] = await Promise.all([
        CursorService.getCurrentMachineIds(),
        CursorService.getMachineIdFileContent(),
      ]);
      setCurrentMachineIds(ids);
      setMachineIdFileContent(content);
    } catch (error) {
      console.error("加载当前 Machine ID 失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      setLoading(true);
      const backupList = await CursorService.getBackups();
      setBackups(backupList);
      setCurrentStep("select");
    } catch (error) {
      console.error("加载备份失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackupSelect = async (backup: BackupInfo) => {
    try {
      setLoading(true);
      setSelectedBackup(backup);
      const ids = await CursorService.extractBackupIds(backup.path);
      setSelectedIds(ids);
      setCurrentStep("preview");
    } catch (error) {
      console.error("解析备份内容失败:", error);
      alert("无法从备份中提取机器ID信息");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;

    try {
      setLoading(true);
      setCurrentStep("confirm");
      const result = await CursorService.restoreMachineIds(selectedBackup.path);
      setRestoreResult(result);
      setCurrentStep("result");

      if (result.success) {
        await loadCurrentMachineIds();
      }
    } catch (error) {
      console.error("恢复失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const showResetConfirm = () => {
    setCurrentStep("confirm_reset");
  };

  const showCompleteResetConfirm = () => {
    setCurrentStep("confirm_complete_reset");
  };

  const handleReset = async () => {
    try {
      setLoading(true);
      const result = await CursorService.resetMachineIds();
      setResetResult(result);
      setCurrentStep("reset");

      if (result.success) {
        await loadCurrentMachineIds();
      }
    } catch (error) {
      console.error("重置失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async () => {
    try {
      setLoading(true);
      const result = await CursorService.completeResetMachineIds();
      setResetResult(result);
      setCurrentStep("complete_reset");

      if (result.success) {
        await loadCurrentMachineIds();
      }
    } catch (error) {
      console.error("完全重置失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBackup = (backup: BackupInfo, event?: React.MouseEvent) => {
    event?.stopPropagation(); // 防止触发选择备份

    showConfirm({
      title: "删除备份",
      message: `确定要删除备份 "${backup.date_formatted}" 吗？此操作无法撤销。`,
      confirmText: "删除",
      cancelText: "取消",
      type: "danger",
      onConfirm: async () => {
        try {
          const result = await CursorService.deleteBackup(backup.path);

          if (result.success) {
            // 重新加载备份列表
            await loadBackups();
            showSuccess("备份删除成功");
          } else {
            showError(`删除失败: ${result.message}`);
          }
        } catch (error) {
          console.error("删除备份失败:", error);
          showError("删除备份时发生错误");
        }
      },
    });
  };

  if (loading && currentStep === "menu") {
    return <LoadingSpinner message="正在加载 Machine ID 信息..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Machine ID 管理</h1>
        <p className="mt-1 text-sm text-gray-600">
          管理 Cursor 的 Machine ID，包括查看、备份、恢复和重置
        </p>
      </div>

      {/* Current Machine IDs */}
      {currentMachineIds && (
        <div className="p-6 bg-white rounded-lg shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">
            📋 当前 Machine ID
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {Object.entries(currentMachineIds).map(([key, value]) => (
              <div key={key} className="p-3 rounded bg-gray-50">
                <p className="text-sm font-medium text-gray-700">{key}</p>
                <p className="font-mono text-xs text-gray-600 break-all">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {machineIdFileContent && (
            <div className="p-3 mt-4 rounded bg-blue-50">
              <p className="mb-2 text-sm font-medium text-blue-700">
                machineId 文件内容:
              </p>
              <p className="font-mono text-xs text-blue-600 break-all">
                {machineIdFileContent}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {currentStep === "menu" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Button
            variant="primary"
            onClick={loadBackups}
            loading={loading}
            className="flex-col h-20"
          >
            <span className="mb-1 text-lg">📁</span>
            恢复备份
          </Button>

          <Button
            variant="secondary"
            onClick={showResetConfirm}
            loading={loading}
            className="flex-col h-20"
          >
            <span className="mb-1 text-lg">🔄</span>
            重置 ID
          </Button>

          <Button
            variant="danger"
            onClick={showCompleteResetConfirm}
            loading={loading}
            className="flex-col h-20"
          >
            <span className="mb-1 text-lg">🗑️</span>
            完全重置
          </Button>
        </div>
      )}

      {/* Backup Selection */}
      {currentStep === "select" && (
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">选择备份</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentStep("menu")}
            >
              返回
            </Button>
          </div>

          {backups.length === 0 ? (
            <p className="py-8 text-center text-gray-500">没有找到备份文件</p>
          ) : (
            <div className="space-y-3">
              {backups.map((backup, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
                  onClick={() => handleBackupSelect(backup)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {backup.date_formatted}
                      </p>
                      <p className="text-sm text-gray-600">
                        大小: {backup.size} bytes
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => handleDeleteBackup(backup, e)}
                        className="text-xs"
                      >
                        🗑️ 删除
                      </Button>
                      <span className="text-blue-600">→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Step */}
      {currentStep === "preview" && selectedBackup && selectedIds && (
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">预览备份内容</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentStep("select")}
            >
              返回
            </Button>
          </div>

          <div className="mb-6 space-y-4">
            <div className="p-4 rounded-lg bg-blue-50">
              <h3 className="mb-2 font-medium text-blue-800">备份信息</h3>
              <p className="text-sm text-blue-700">
                日期: {selectedBackup.date_formatted}
              </p>
              <p className="text-sm text-blue-700">
                大小: {selectedBackup.size} bytes
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-gray-800">
                将要恢复的 Machine ID:
              </h3>
              {Object.entries(selectedIds).map(([key, value]) => (
                <div key={key} className="p-3 rounded bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">{key}</p>
                  <p className="font-mono text-xs text-gray-600 break-all">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="primary" onClick={handleRestore} loading={loading}>
              确认恢复
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentStep("select")}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Step */}
      {currentStep === "confirm" && (
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="text-center">
            <div className="mb-4 text-4xl">⏳</div>
            <h2 className="mb-2 text-lg font-medium text-gray-900">
              正在恢复...
            </h2>
            <p className="text-gray-600">请稍候，正在恢复 Machine ID</p>
          </div>
        </div>
      )}

      {/* Result Step */}
      {currentStep === "result" && restoreResult && (
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="mb-6 text-center">
            <div
              className={`text-4xl mb-4 ${
                restoreResult.success ? "text-green-500" : "text-red-500"
              }`}
            >
              {restoreResult.success ? "✅" : "❌"}
            </div>
            <h2 className="mb-2 text-lg font-medium text-gray-900">
              {restoreResult.success ? "恢复成功" : "恢复失败"}
            </h2>
            <p className="text-gray-600">{restoreResult.message}</p>
          </div>

          {restoreResult.details && restoreResult.details.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 font-medium text-gray-700">详细信息:</h3>
              <div className="space-y-1">
                {restoreResult.details.map((detail, index) => (
                  <p
                    key={index}
                    className="p-2 text-sm text-gray-600 rounded bg-gray-50"
                  >
                    {detail}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setCurrentStep("menu");
                setRestoreResult(null);
                setSelectedBackup(null);
                setSelectedIds(null);
              }}
            >
              返回主菜单
            </Button>
            <Button variant="secondary" onClick={loadCurrentMachineIds}>
              刷新当前 ID
            </Button>
          </div>
        </div>
      )}

      {/* Reset Result */}
      {(currentStep === "reset" || currentStep === "complete_reset") &&
        resetResult && (
          <div className="p-6 bg-white rounded-lg shadow">
            <div className="mb-6 text-center">
              <div
                className={`text-4xl mb-4 ${
                  resetResult.success ? "text-green-500" : "text-red-500"
                }`}
              >
                {resetResult.success ? "✅" : "❌"}
              </div>
              <h2 className="mb-2 text-lg font-medium text-gray-900">
                {currentStep === "complete_reset" ? "完全重置" : "重置"}
                {resetResult.success ? "成功" : "失败"}
              </h2>
              <p className="text-gray-600">{resetResult.message}</p>
            </div>

            {resetResult.new_ids && (
              <div className="mb-6">
                <h3 className="mb-2 font-medium text-gray-700">
                  新的 Machine ID:
                </h3>
                <div className="space-y-2">
                  {Object.entries(resetResult.new_ids).map(([key, value]) => (
                    <div key={key} className="p-3 rounded bg-green-50">
                      <p className="text-sm font-medium text-green-700">
                        {key}
                      </p>
                      <p className="font-mono text-xs text-green-600 break-all">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resetResult.details && resetResult.details.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-2 font-medium text-gray-700">详细信息:</h3>
                <div className="space-y-1">
                  {resetResult.details.map((detail, index) => (
                    <p
                      key={index}
                      className="p-2 text-sm text-gray-600 rounded bg-gray-50"
                    >
                      {detail}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <Button
                variant="primary"
                onClick={() => {
                  setCurrentStep("menu");
                  setResetResult(null);
                }}
              >
                返回主菜单
              </Button>
              <Button variant="secondary" onClick={loadCurrentMachineIds}>
                刷新当前 ID
              </Button>
            </div>
          </div>
        )}

      {/* Reset Confirmation */}
      {currentStep === "confirm_reset" && (
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="mb-6 text-center">
            <div className="mb-4 text-4xl">⚠️</div>
            <h2 className="mb-2 text-lg font-medium text-gray-900">
              确认重置 Machine ID
            </h2>
            <p className="mb-4 text-gray-600">
              此操作将重置所有 Machine ID 为新的随机值。这可能会影响 Cursor
              的授权状态。
            </p>
            <div className="p-4 mb-4 border border-yellow-200 rounded-md bg-yellow-50">
              <p className="text-sm text-yellow-800">
                <strong>注意：</strong>重置后您可能需要重新登录 Cursor 账户。
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <Button variant="danger" onClick={handleReset} loading={loading}>
              确认重置
            </Button>
            <Button variant="secondary" onClick={() => setCurrentStep("menu")}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Complete Reset Confirmation */}
      {currentStep === "confirm_complete_reset" && (
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="mb-6 text-center">
            <div className="mb-4 text-4xl">🚨</div>
            <h2 className="mb-2 text-lg font-medium text-gray-900">
              确认完全重置
            </h2>
            <p className="mb-4 text-gray-600">
              此操作将完全清除 Cursor 的所有配置和数据，包括 Machine
              ID，以及注入脚本等。
            </p>
            <div className="p-4 mb-4 border border-red-200 rounded-md bg-red-50">
              <p className="text-sm text-red-800">
                <strong>危险操作：</strong>这将删除所有 Cursor
                相关数据，无法撤销！
              </p>
              <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                <li>所有用户设置将被清除</li>
                <li>已安装的扩展将被移除</li>
                <li>需要重新配置 Cursor</li>
                <li>需要重新登录账户</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="danger"
              onClick={handleCompleteReset}
              loading={loading}
            >
              确认完全重置
            </Button>
            <Button variant="secondary" onClick={() => setCurrentStep("menu")}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Toast 管理器 */}
      <ToastManager toasts={toasts} removeToast={removeToast} />

      {/* 确认对话框 */}
      <ConfirmDialog />
    </div>
  );
};
