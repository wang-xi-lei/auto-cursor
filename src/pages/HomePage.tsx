import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CursorService } from "../services/cursorService";

import { LoadingSpinner } from "../components/LoadingSpinner";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { PageSection } from "../components/PageSection";

export const HomePage: React.FC = () => {
  const [cursorInstalled, setCursorInstalled] = useState<boolean | null>(null);
  const [cursorPaths, setCursorPaths] = useState<[string, string] | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    checkCursorInstallation();
  }, []);

  const checkCursorInstallation = async () => {
    try {
      setLoading(true);
      const installed = await CursorService.checkCursorInstallation();
      setCursorInstalled(installed);

      if (installed) {
        const paths = await CursorService.getCursorPaths();
        setCursorPaths(paths);
      } else {
        const debug = await CursorService.debugCursorPaths();
        setDebugInfo(debug);
      }
    } catch (error) {
      console.error("检查 Cursor 安装失败:", error);
      setCursorInstalled(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="正在检查 Cursor 安装状态..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cursor Manager"
        description="管理和恢复 Cursor 的 Machine ID、查看使用统计、账号管理"
      />

      {/* Status */}
      <PageSection title="🔍 Cursor 安装状态">

        {cursorInstalled === true ? (
          <div className="space-y-4">
            <div className="flex items-center">
              <span className="mr-2 text-xl text-green-500">✅</span>
              <span className="font-medium text-green-700 dark:text-green-400">Cursor 已安装</span>
            </div>

            {cursorPaths && (
              <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/30">
                <h3 className="mb-2 font-medium text-green-800 dark:text-green-300">安装路径:</h3>
                <div className="space-y-1 text-sm text-green-700 dark:text-green-400">
                  <p>
                    <strong>应用路径:</strong> {cursorPaths[0]}
                  </p>
                  <p>
                    <strong>配置路径:</strong> {cursorPaths[1]}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center">
              <span className="mr-2 text-xl text-red-500">❌</span>
              <span className="font-medium text-red-700 dark:text-red-400">
                未检测到 Cursor 安装
              </span>
            </div>

            <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30">
              <p className="mb-2 text-sm text-red-700 dark:text-red-300">
                请确保 Cursor 已正确安装并至少运行过一次。
              </p>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? "隐藏" : "显示"}调试信息
              </Button>

              {showDebug && debugInfo.length > 0 && (
                <div className="mt-3 space-y-1">
                  {debugInfo.map((info, index) => (
                    <p
                      key={index}
                      className="p-2 text-xs text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/50 rounded"
                    >
                      {info}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </PageSection>

      {/* 快捷操作 */}
      {cursorInstalled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Machine ID Management */}
          <PageSection className="hover:shadow-md transition-shadow" title="Machine ID 管理" icon={<span>🔧</span>}>
            <p className="mb-4 text-sm text-gray-600 dark:text-blue-200/70">
              查看、备份、恢复或重置 Cursor 的 Machine ID
            </p>
            <Link to="/machine-id">
              <Button variant="primary" className="w-full">
                进入管理
              </Button>
            </Link>
          </PageSection>

          {/* Auth Check */}
          <PageSection className="hover:shadow-md transition-shadow" title="授权检查" icon={<span>🔐</span>}>
            <p className="mb-4 text-sm text-gray-600 dark:text-blue-200/70">检查 Cursor 账户授权状态和订阅信息</p>
            <Link to="/auth-check">
              <Button variant="primary" className="w-full">开始检查</Button>
            </Link>
          </PageSection>
        </div>
      )}

      {/* Refresh Button */}
      <div className="text-center">
        <Button
          variant="secondary"
          onClick={checkCursorInstallation}
          loading={loading}
        >
          🔄 重新检查
        </Button>
      </div>
    </div>
  );
};
