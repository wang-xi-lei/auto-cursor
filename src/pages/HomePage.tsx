import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CursorService } from "../services/cursorService";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Button } from "../components/Button";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Cursor Machine ID Restorer
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          管理和恢复 Cursor 的 Machine ID
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          🔍 Cursor 安装状态
        </h2>
        
        {cursorInstalled === true ? (
          <div className="space-y-4">
            <div className="flex items-center">
              <span className="text-green-500 text-xl mr-2">✅</span>
              <span className="text-green-700 font-medium">Cursor 已安装</span>
            </div>
            
            {cursorPaths && (
              <div className="bg-green-50 p-4 rounded-md">
                <h3 className="font-medium text-green-800 mb-2">安装路径:</h3>
                <div className="space-y-1 text-sm text-green-700">
                  <p><strong>应用路径:</strong> {cursorPaths[0]}</p>
                  <p><strong>配置路径:</strong> {cursorPaths[1]}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center">
              <span className="text-red-500 text-xl mr-2">❌</span>
              <span className="text-red-700 font-medium">未检测到 Cursor 安装</span>
            </div>
            
            <div className="bg-red-50 p-4 rounded-md">
              <p className="text-red-700 text-sm mb-2">
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
                    <p key={index} className="text-xs text-red-600 bg-red-100 p-2 rounded">
                      {info}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Cards */}
      {cursorInstalled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Machine ID Management */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-3">🔧</span>
              <h3 className="text-lg font-medium text-gray-900">
                Machine ID 管理
              </h3>
            </div>
            <p className="text-gray-600 mb-4">
              查看、备份、恢复或重置 Cursor 的 Machine ID
            </p>
            <Link to="/machine-id">
              <Button variant="primary" className="w-full">
                进入管理
              </Button>
            </Link>
          </div>

          {/* Auth Check */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-3">🔐</span>
              <h3 className="text-lg font-medium text-gray-900">
                授权检查
              </h3>
            </div>
            <p className="text-gray-600 mb-4">
              检查 Cursor 账户授权状态和订阅信息
            </p>
            <Link to="/auth-check">
              <Button variant="primary" className="w-full">
                开始检查
              </Button>
            </Link>
          </div>
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
