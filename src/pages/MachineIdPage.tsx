import React, { useState, useEffect } from "react";
import { CursorService } from "../services/cursorService";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Button } from "../components/Button";
import { useToast, ToastManager } from "../components/Toast";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { PageSection } from "../components/PageSection";
import { InfoCard } from "../components/InfoCard";
import { ActionCard } from "../components/ActionCard";
import { StatusCard } from "../components/StatusCard";
import { BackupSelectModal } from "../components/BackupSelectModal";
import {
  BackupInfo,
  MachineIds,
  RestoreResult,
  ResetResult,
} from "../types/auth";

type Step =
  | "menu"
  | "result"
  | "reset"
  | "complete_reset"
  | "custom_path_config";

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
  const [customCursorPath, setCustomCursorPath] = useState<string>("");
  const [currentCustomPath, setCurrentCustomPath] = useState<string | null>(
    null
  );
  const [isWindows, setIsWindows] = useState<boolean>(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Toast 和确认对话框
  const { toasts, removeToast, showSuccess, showError } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    // 检测操作系统
    const platform = navigator.platform.toLowerCase();
    const isWindowsOS = platform.includes("win");
    setIsWindows(isWindowsOS);

    loadCurrentMachineIds();
    if (isWindowsOS) {
      loadCustomCursorPath();
    }
  }, []);

  const loadCustomCursorPath = async () => {
    try {
      const path = await CursorService.getCustomCursorPath();
      setCurrentCustomPath(path);
      setCustomCursorPath(path || "");
    } catch (error) {
      console.error("加载自定义Cursor路径失败:", error);
    }
  };

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
      setShowBackupModal(true);
    } catch (error) {
      console.error("加载备份失败:", error);
      showError("加载备份列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupSelect = async (backup: BackupInfo | null) => {
    if (!backup) {
      // 返回列表
      setSelectedBackup(null);
      setSelectedIds(null);
      return;
    }

    try {
      setLoading(true);
      setSelectedBackup(backup);
      const ids = await CursorService.extractBackupIds(backup.path);
      setSelectedIds(ids);
    } catch (error) {
      console.error("解析备份内容失败:", error);
      showError("无法从备份中提取机器ID信息");
      setSelectedBackup(null);
      setSelectedIds(null);
    } finally {
      setLoading(false);
    }
  };

  const showRestoreConfirm = () => {
    if (!selectedBackup || !selectedIds) return;

    const idsPreview = Object.entries(selectedIds)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    showConfirm({
      title: "确认恢复备份",
      message: `确定要恢复此备份吗？这将替换当前的 Machine ID。\n\n备份日期: ${selectedBackup.date_formatted}\n\n将要恢复的 Machine ID:\n${idsPreview}`,
      confirmText: "确认恢复",
      cancelText: "取消",
      type: "warning",
      onConfirm: handleRestoreConfirm,
    });
  };

  const handleRestoreConfirm = async () => {
    if (!selectedBackup) return;

    try {
      const result = await CursorService.restoreMachineIds(selectedBackup.path);
      setRestoreResult(result);
      setCurrentStep("result");
      setShowBackupModal(false); // 关闭模态框

      if (result.success) {
        await loadCurrentMachineIds();
        showSuccess("Machine ID 恢复成功");
      } else {
        showError(`恢复失败: ${result.message}`);
      }
    } catch (error) {
      console.error("恢复失败:", error);
      showError("恢复过程中发生错误");
    }
  };

  const handleCloseBackupModal = () => {
    setShowBackupModal(false);
    setSelectedBackup(null);
    setSelectedIds(null);
  };

  const showResetConfirm = () => {
    showConfirm({
      title: "确认重置 Machine ID",
      message:
        "此操作将重置所有 Machine ID 为新的随机值，这可能会影响 Cursor 的授权状态。是否继续？",
      confirmText: "确认重置",
      cancelText: "取消",
      type: "warning",
      onConfirm: handleReset,
    });
  };

  const showCompleteResetConfirm = () => {
    showConfirm({
      title: "确认完全清理",
      message:
        "此操作将完全清除 Cursor 的所有配置和数据（包括 Machine ID、用户设置、扩展、注入脚本等）。该操作不可撤销，且需要重新登录并重新配置。是否继续？",
      confirmText: "确认完全清理",
      cancelText: "取消",
      type: "danger",
      onConfirm: handleCompleteReset,
    });
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

  const handleDeleteBackup = (backup: BackupInfo) => {
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

  const handleOpenLogDirectory = async () => {
    try {
      const result = await CursorService.openLogDirectory();
      showSuccess(result);
    } catch (error) {
      console.error("打开日志目录失败:", error);
      showError(`打开日志目录失败: ${error}`);
    }
  };

  const handleGetLogPath = async () => {
    try {
      const logPath = await CursorService.getLogFilePath();
      showSuccess(`日志文件路径: ${logPath}`);
      console.log("日志文件路径:", logPath);
    } catch (error) {
      console.error("获取日志路径失败:", error);
      showError(`获取日志路径失败: ${error}`);
    }
  };

  // Unused but kept for future debugging needs
  // const handleDebugWindowsPaths = async () => {
  //   try {
  //     const debugInfo = await CursorService.debugWindowsCursorPaths();
  //     console.log("Windows路径调试信息:", debugInfo);
  //     const formattedInfo = debugInfo.join("\n\n");
  //     console.log(`Windows Cursor路径调试信息:\n\n${formattedInfo}`);
  //     showSuccess("Windows路径调试完成，详细信息已输出到控制台");
  //   } catch (error) {
  //     console.error("Windows路径调试失败:", error);
  //     showError(`Windows路径调试失败: ${error}`);
  //   }
  // };

  const handleSetCustomPath = async () => {
    if (!customCursorPath.trim()) {
      showError("请输入Cursor路径");
      return;
    }

    try {
      const result = await CursorService.setCustomCursorPath(
        customCursorPath.trim()
      );
      console.log("设置自定义路径结果:", result);

      // 重新加载当前路径
      await loadCustomCursorPath();

      showSuccess("自定义Cursor路径设置成功");
      console.log(`路径设置结果:\n\n${result}`);
    } catch (error) {
      console.error("设置自定义路径失败:", error);
      showError(`设置自定义路径失败: ${error}`);
    }
  };

  const handleClearCustomPath = async () => {
    try {
      const result = await CursorService.clearCustomCursorPath();
      console.log("清除自定义路径结果:", result);

      // 重新加载当前路径
      await loadCustomCursorPath();

      showSuccess(result);
    } catch (error) {
      console.error("清除自定义路径失败:", error);
      showError(`清除自定义路径失败: ${error}`);
    }
  };

  const handleFillDetectedPath = async () => {
    try {
      const debugInfo = await CursorService.debugWindowsCursorPaths();

      // 查找第一个有效的路径
      for (const info of debugInfo) {
        if (
          info.includes("- package.json: true") &&
          info.includes("- main.js: true")
        ) {
          const pathMatch = info.match(/路径\d+: (.+)/);
          if (pathMatch) {
            const detectedPath = pathMatch[1].trim();
            setCustomCursorPath(detectedPath);
            showSuccess(`已填充检测到的路径: ${detectedPath}`);
            return;
          }
        }
      }

      showError("未检测到有效的Cursor安装路径");
    } catch (error) {
      console.error("自动填充路径失败:", error);
      showError(`自动填充路径失败: ${error}`);
    }
  };

  if (loading && currentStep === "menu") {
    return <LoadingSpinner message="正在加载 Machine ID 信息..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Machine ID 管理"
        description="查看、备份、恢复和重置 Cursor 的 Machine ID"
      />

      {/* 当前 Machine IDs */}
      {currentMachineIds && (
        <PageSection title="📋 当前 Machine ID">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Object.entries(currentMachineIds).map(([key, value]) => (
              <InfoCard key={key} title={key} value={String(value)} copyable />
            ))}
          </div>

          {machineIdFileContent && (
            <div className="mt-3">
              <InfoCard
                title="machineId 文件内容"
                value={machineIdFileContent}
                copyable
                variant="primary"
              />
            </div>
          )}
        </PageSection>
      )}

      {/* 主要操作 */}
      {currentStep === "menu" && (
        <div className="space-y-6">
          {/* 主要操作 */}
          <PageSection title="🛠️ 主要操作">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ActionCard
                title="恢复备份"
                description="从备份中恢复 Machine ID"
                icon="📁"
                onClick={loadBackups}
                variant="primary"
                loading={loading}
              />
              <ActionCard
                title="重置 ID"
                description="生成新的随机 Machine ID"
                icon="🔄"
                onClick={showResetConfirm}
                variant="secondary"
              />
              <ActionCard
                title="完全重置"
                description="清除所有 Cursor 数据与配置"
                icon="🗑️"
                onClick={showCompleteResetConfirm}
                variant="danger"
              />
            </div>
          </PageSection>

          {/* 日志管理 */}
          <PageSection title="📝 日志管理">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ActionCard
                title="获取日志路径"
                description="显示当前日志文件的存放位置"
                icon="📍"
                onClick={handleGetLogPath}
                variant="secondary"
              />
              <ActionCard
                title="打开日志目录"
                description="在系统文件管理器中打开日志目录"
                icon="📂"
                onClick={handleOpenLogDirectory}
                variant="secondary"
              />
            </div>
          </PageSection>

          {/* 自定义路径配置按钮 - 仅Windows显示 */}
          {isWindows && (
            <PageSection title="⚙️ 路径配置">
              <ActionCard
                title="自定义 Cursor 路径"
                description="手动设置 Cursor 安装路径 (resources/app)"
                icon="📁"
                onClick={() => setCurrentStep("custom_path_config")}
                variant="secondary"
              />
              {currentCustomPath && (
                <div className="p-3 mt-3 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg">
                  <span className="font-medium text-blue-900 dark:text-blue-300">当前自定义路径:</span>
                  <br />
                  <span className="text-blue-800 dark:text-blue-400 font-mono break-all">{currentCustomPath}</span>
                </div>
              )}
            </PageSection>
          )}
        </div>
      )}

      {/* 自定义路径配置页面 */}
      {currentStep === "custom_path_config" && (
        <PageSection>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">自定义 Cursor 路径配置</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentStep("menu")}
            >
              ← 返回
            </Button>
          </div>

          <div className="space-y-4">
            {/* 说明文字 */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <h3 className="mb-1.5 text-sm font-medium text-blue-800 dark:text-blue-200">
                🔍 路径配置说明
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-snug">
                如果自动检测无法找到 Cursor 安装路径，你可以手动指定。
                <br />
                路径应该指向 Cursor 的 <code className="px-1 bg-blue-100 dark:bg-blue-800/40 rounded">resources/app</code> 目录。
                <br />
                例如: <code className="px-1 bg-blue-100 dark:bg-blue-800/40 rounded">C:\\Users\\用户名\\AppData\\Local\\Programs\\Cursor\\resources\\app</code>
              </p>
            </div>

            {/* 当前状态 */}
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50">
              <h3 className="mb-1.5 text-sm font-medium text-gray-800 dark:text-white">📍 当前状态</h3>
              <div className="text-xs text-gray-600 dark:text-slate-300">
                {currentCustomPath ? (
                  <div>
                    <span className="font-medium">已设置自定义路径:</span>
                    <br />
                    <span className="px-1 font-mono text-xs bg-gray-200 dark:bg-slate-700 rounded">
                      {currentCustomPath}
                    </span>
                  </div>
                ) : (
                  <span>未设置自定义路径，使用自动检测</span>
                )}
              </div>
            </div>

            {/* 路径输入 */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-800 dark:text-white">📝 设置自定义路径</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  value={customCursorPath}
                  onChange={(e) => setCustomCursorPath(e.target.value)}
                  placeholder="请输入 Cursor 的 resources/app 目录完整路径"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSetCustomPath}
                  >
                    💾 保存
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleFillDetectedPath}
                  >
                    🔍 自动检测
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleClearCustomPath}
                  >
                    🗑️ 清除
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PageSection>
      )}

      {/* Result Step */}
      {currentStep === "result" && restoreResult && (
        <StatusCard
          status={restoreResult.success ? "success" : "error"}
          title={restoreResult.success ? "恢复成功" : "恢复失败"}
          message={restoreResult.message}
          details={restoreResult.details}
          actions={
            <>
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
            </>
          }
        />
      )}

      {/* Reset Result */}
      {(currentStep === "reset" || currentStep === "complete_reset") &&
        resetResult && (
          <>
            <StatusCard
              status={resetResult.success ? "success" : "error"}
              title={`${currentStep === "complete_reset" ? "完全重置" : "重置"}${
                resetResult.success ? "成功" : "失败"
              }`}
              message={resetResult.message}
              details={resetResult.details}
              actions={
                <>
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
                </>
              }
            />

            {resetResult.new_ids && (
              <PageSection className="mt-3" title="新的 Machine ID">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {Object.entries(resetResult.new_ids).map(([key, value]) => (
                    <InfoCard
                      key={key}
                      title={key}
                      value={String(value)}
                      variant="success"
                      copyable
                    />
                  ))}
                </div>
              </PageSection>
            )}
          </>
        )}

      

      {/* 备份选择模态框 */}
      <BackupSelectModal
        isOpen={showBackupModal}
        backups={backups}
        selectedBackup={selectedBackup}
        selectedIds={selectedIds}
        loading={loading}
        onClose={handleCloseBackupModal}
        onSelectBackup={handleBackupSelect}
        onConfirmRestore={showRestoreConfirm}
        onDeleteBackup={handleDeleteBackup}
      />

      {/* Toast 管理器 */}
      <ToastManager toasts={toasts} removeToast={removeToast} />

      {/* 确认对话框 */}
      <ConfirmDialog />
    </div>
  );
};
