import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, AlertTriangle, CheckCircle, XCircle, Terminal, Loader2 } from "lucide-react";

interface WarpCleanResult {
  success: boolean;
  message: string;
  cleaned_items: string[];
  errors: string[];
}

export const WarpCleanPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [cleanResult, setCleanResult] = useState<WarpCleanResult | null>(null);
  const [isWarpRunning, setIsWarpRunning] = useState<boolean | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 检查Warp是否正在运行
  const checkWarpStatus = async () => {
    try {
      const running = await invoke<boolean>("check_warp_running");
      setIsWarpRunning(running);
      return running;
    } catch (error) {
      console.error("检查Warp状态失败:", error);
      return false;
    }
  };

  // 强制关闭Warp进程
  const killWarpProcess = async () => {
    try {
      setIsLoading(true);
      const success = await invoke<boolean>("kill_warp_process");
      if (success) {
        setIsWarpRunning(false);
        alert("✅ Warp进程已成功关闭");
      } else {
        alert("⚠️ Warp进程可能未在运行");
      }
    } catch (error) {
      console.error("关闭Warp进程失败:", error);
      alert(`❌ 关闭Warp进程失败: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 执行清理
  const performClean = async () => {
    try {
      setIsLoading(true);
      setCleanResult(null);
      setShowConfirmDialog(false);

      // 先检查Warp是否在运行
      const running = await checkWarpStatus();
      if (running) {
        const shouldKill = window.confirm(
          "⚠️ 检测到Warp正在运行！\n\n是否自动关闭Warp进程？\n\n点击'确定'将强制关闭Warp\n点击'取消'将终止清理操作"
        );
        
        if (shouldKill) {
          await killWarpProcess();
          // 等待一下确保进程完全关闭
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          setIsLoading(false);
          return;
        }
      }

      // 执行清理
      const result = await invoke<WarpCleanResult>("clean_warp_data", { force: true });
      setCleanResult(result);
    } catch (error) {
      console.error("清理失败:", error);
      setCleanResult({
        success: false,
        message: `清理失败: ${error}`,
        cleaned_items: [],
        errors: [String(error)],
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 显示确认对话框
  const handleCleanClick = async () => {
    // 先检查状态
    await checkWarpStatus();
    setShowConfirmDialog(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 标题区域 */}
      <div className="flex-shrink-0 mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl shadow-lg">
            <Terminal className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Warp 清理</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">清理Warp终端的所有用户数据和配置</p>
          </div>
        </div>
      </div>

      {/* 警告提示 */}
      <div className="flex-shrink-0 mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">重要提示</h3>
            <ul className="text-sm text-yellow-700 dark:text-yellow-400 space-y-1">
              <li>• 此操作将删除所有Warp用户数据、登录状态和个人配置</li>
              <li>• 清理后Warp将恢复到全新安装状态</li>
              <li>• 数据删除后无法恢复，请谨慎操作</li>
              <li>• 清理后可重新申请Warp账号，实现无限试用</li>
              <li>• 支持 Windows / macOS / Linux 平台</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 清理范围说明 */}
      <div className="flex-shrink-0 mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">清理范围</h3>
        <div className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
          <div>
            <strong>Windows</strong>
            <p className="ml-4 text-xs">注册表: HKCU\\Software\\Warp.dev\\Warp, HKCU\\Software\\Warp.dev\\Warp-Preview</p>
            <p className="ml-4 text-xs">用户数据: %LOCALAPPDATA%\\warp\\Warp(\\Warp-Preview)</p>
            <p className="ml-4 text-xs">配置: %APPDATA%\\warp\\Warp(\\Warp-Preview)</p>
          </div>
          <div>
            <strong>macOS</strong>
            <p className="ml-4 text-xs">~/Library/Application Support/dev.warp.Warp(-Stable/-Preview)</p>
            <p className="ml-4 text-xs">~/Library/Caches/dev.warp.Warp(-Stable/-Preview)</p>
            <p className="ml-4 text-xs">~/Library/WebKit/dev.warp.Warp-Stable</p>
            <p className="ml-4 text-xs">~/Library/Preferences/dev.warp.Warp(-Stable/-Preview).plist</p>
            <p className="ml-4 text-xs">~/Library/Saved Application State/dev.warp.Warp(-Stable).savedState</p>
          </div>
          <div>
            <strong>Linux</strong>
            <p className="ml-4 text-xs">~/.config/dev.warp.Warp 或 ~/.config/warp</p>
            <p className="ml-4 text-xs">~/.local/share/dev.warp.Warp 或 ~/.local/share/warp</p>
            <p className="ml-4 text-xs">~/.cache/dev.warp.Warp 或 ~/.cache/warp</p>
            <p className="ml-4 text-xs">Flatpak: ~/.var/app/dev.warp.Warp</p>
          </div>
        </div>
      </div>

      {/* Warp状态检查 */}
      <div className="flex-shrink-0 mb-6">
        <button
          onClick={checkWarpStatus}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? "检查中..." : "检查Warp运行状态"}
        </button>
        {isWarpRunning !== null && (
          <div className="mt-2 text-sm">
            {isWarpRunning ? (
              <span className="text-orange-600 dark:text-orange-400">⚠️ Warp正在运行</span>
            ) : (
              <span className="text-green-600 dark:text-green-400">✅ Warp未在运行</span>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex-shrink-0 mb-6 flex space-x-4">
        <button
          onClick={handleCleanClick}
          disabled={isLoading}
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>清理中...</span>
            </>
          ) : (
            <>
              <Trash2 className="w-5 h-5" />
              <span>开始清理</span>
            </>
          )}
        </button>

        {isWarpRunning && (
          <button
            onClick={killWarpProcess}
            disabled={isLoading}
            className="flex items-center space-x-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            <XCircle className="w-5 h-5" />
            <span>关闭Warp进程</span>
          </button>
        )}
      </div>

      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">确认清理</h2>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              您确定要清理所有Warp数据吗？
              <br />
              <br />
              此操作将：
              <br />• 删除所有登录信息
              <br />• 删除所有个人配置
              <br />• 删除所有用户数据
              <br />
              <br />
              <strong className="text-red-600 dark:text-red-400">此操作不可撤销！</strong>
            </p>
            <div className="flex space-x-3">
              <button
                onClick={performClean}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                确认清理
              </button>
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清理结果 */}
      {cleanResult && (
        <div className="flex-1 overflow-auto">
          <div
            className={`p-6 rounded-xl border ${
              cleanResult.success
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            }`}
          >
            <div className="flex items-start space-x-3 mb-4">
              {cleanResult.success ? (
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3
                  className={`text-lg font-semibold mb-2 ${
                    cleanResult.success
                      ? "text-green-800 dark:text-green-300"
                      : "text-red-800 dark:text-red-300"
                  }`}
                >
                  {cleanResult.message}
                </h3>

                {cleanResult.cleaned_items.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-green-700 dark:text-green-400 mb-2">
                      已清理项目 ({cleanResult.cleaned_items.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-green-600 dark:text-green-400">
                      {cleanResult.cleaned_items.map((item, index) => (
                        <li key={index} className="flex items-start">
                          <span className="mr-2">✓</span>
                          <span className="break-all">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {cleanResult.errors.length > 0 && (
                  <div>
                    <h4 className="font-medium text-red-700 dark:text-red-400 mb-2">
                      错误信息 ({cleanResult.errors.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
                      {cleanResult.errors.map((error, index) => (
                        <li key={index} className="flex items-start">
                          <span className="mr-2">✗</span>
                          <span className="break-all">{error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
