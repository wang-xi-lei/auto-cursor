import React from "react";
import { Button } from "./Button";
import { BackupInfo, MachineIds } from "../types/auth";
import { InfoCard } from "./InfoCard";

interface BackupSelectModalProps {
  isOpen: boolean;
  backups: BackupInfo[];
  selectedBackup: BackupInfo | null;
  selectedIds: MachineIds | null;
  loading: boolean;
  onClose: () => void;
  onSelectBackup: (backup: BackupInfo) => void;
  onConfirmRestore: () => void;
  onDeleteBackup: (backup: BackupInfo) => void;
}

export const BackupSelectModal: React.FC<BackupSelectModalProps> = ({
  isOpen,
  backups,
  selectedBackup,
  selectedIds,
  loading,
  onClose,
  onSelectBackup,
  onConfirmRestore,
  onDeleteBackup,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 transition-opacity bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative w-full max-w-3xl mx-4 transition-all transform bg-white dark:bg-slate-900 rounded-lg shadow-xl max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {selectedBackup ? "预览备份内容" : "选择备份"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {!selectedBackup ? (
            // 备份列表
            backups.length === 0 ? (
              <p className="py-8 text-center text-gray-500 dark:text-slate-400">
                没有找到备份文件
              </p>
            ) : (
              <div className="space-y-2">
                {backups.map((backup, index) => (
                  <div
                    key={index}
                    className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 border-gray-200 dark:border-slate-700 transition-colors"
                    onClick={() => onSelectBackup(backup)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {backup.date_formatted}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          大小: {(backup.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBackup(backup);
                          }}
                          className="text-xs"
                        >
                          🗑️ 删除
                        </Button>
                        <span className="text-blue-600 dark:text-blue-400">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // 备份预览
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <h4 className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-300">
                  备份信息
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  日期: {selectedBackup.date_formatted}
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  大小: {selectedBackup.size} bytes
                </p>
              </div>

              {selectedIds && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-800 dark:text-white">
                    将要恢复的 Machine ID:
                  </h4>
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {Object.entries(selectedIds).map(([key, value]) => (
                      <InfoCard
                        key={key}
                        title={key}
                        value={String(value)}
                        copyable
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 按钮栏 */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-slate-700">
          {selectedBackup ? (
            <>
              <Button
                variant="secondary"
                onClick={() => onSelectBackup(null as any)}
              >
                ← 返回列表
              </Button>
              <Button
                variant="primary"
                onClick={onConfirmRestore}
                loading={loading}
              >
                确认恢复
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
