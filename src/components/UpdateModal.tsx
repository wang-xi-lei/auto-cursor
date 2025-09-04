import React, { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { UpdateInfo } from "../types/update";
import { openUpdateUrl } from "../services/updateService";

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  updateInfo,
  onClose,
}) => {
  // 禁用背景滚动
  useEffect(() => {
    // 保存原始样式
    const originalStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };

    // 获取滚动条宽度
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    // 禁用滚动并补偿滚动条宽度
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollBarWidth}px`;

    // 清理函数：恢复原始样式
    return () => {
      document.body.style.overflow = originalStyle.overflow;
      document.body.style.paddingRight = originalStyle.paddingRight;
    };
  }, []);
  const handleUpdate = async () => {
    try {
      await openUpdateUrl(updateInfo.updateUrl);
    } catch (error) {
      console.error("Failed to open update URL:", error);
    }
  };

  const handleClose = () => {
    if (!updateInfo.isForceUpdate) {
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center update-modal-backdrop">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col update-modal-content">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
              <svg
                className="w-4 h-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {updateInfo.isForceUpdate ? "强制更新" : "发现新版本"}
              </h3>
              <p className="text-sm text-gray-500">版本 {updateInfo.version}</p>
            </div>
          </div>
          {!updateInfo.isForceUpdate && (
            <button
              onClick={handleClose}
              className="text-gray-400 transition-colors hover:text-gray-600"
              title="关闭"
              aria-label="关闭更新弹窗"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Update Date */}
          <div className="mb-4">
            <p className="text-sm text-gray-500">
              更新时间：{formatDate(updateInfo.updateDate)}
            </p>
          </div>

          {/* Force Update Warning */}
          {updateInfo.isForceUpdate && (
            <div className="p-4 mb-4 rounded-lg force-update-warning">
              <div className="flex items-center">
                <svg
                  className="flex-shrink-0 w-5 h-5 mr-3 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span className="text-sm font-semibold text-red-800">
                  这是一个强制更新，必须更新后才能继续使用
                </span>
              </div>
            </div>
          )}

          {/* Update Description */}
          <div className="mb-6">
            <h4 className="mb-2 text-sm font-medium text-gray-900">
              更新内容：
            </h4>
            <div className="prose-sm prose text-gray-700 max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="mb-2 list-disc list-inside">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-2 list-decimal list-inside">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  strong: ({ children }) => (
                    <strong className="font-semibold">{children}</strong>
                  ),
                  em: ({ children }) => <em className="italic">{children}</em>,
                  code: ({ children }) => (
                    <code className="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono">
                      {children}
                    </code>
                  ),
                }}
              >
                {updateInfo.description}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 space-x-3 border-t border-gray-200">
          {!updateInfo.isForceUpdate && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 transition-colors bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              稍后更新
            </button>
          )}
          <button
            onClick={handleUpdate}
            className="px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            立即更新
          </button>
        </div>
      </div>
    </div>
  );
};
