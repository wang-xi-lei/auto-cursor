import React from "react";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  type = "warning",
  onConfirm,
  onCancel,
  loading = false
}) => {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: "🚨",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      confirmVariant: "danger" as const
    },
    warning: {
      icon: "⚠️",
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
      confirmVariant: "secondary" as const
    },
    info: {
      icon: "ℹ️",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      confirmVariant: "primary" as const
    }
  };

  const style = typeStyles[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
      />
      
      {/* 对话框 */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 transform transition-all">
        <div className="p-6">
          {/* 图标和标题 */}
          <div className="flex items-center mb-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full ${style.iconBg} flex items-center justify-center mr-3`}>
              <span className="text-lg">{style.icon}</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              {title}
            </h3>
          </div>
          
          {/* 消息内容 */}
          <div className="mb-6">
            <p className="text-sm text-gray-600">
              {message}
            </p>
          </div>
          
          {/* 按钮 */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              variant={style.confirmVariant}
              onClick={onConfirm}
              loading={loading}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 确认对话框 Hook
export const useConfirmDialog = () => {
  const [dialog, setDialog] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "danger" | "warning" | "info";
    onConfirm?: () => void;
    loading?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: ""
  });

  const showConfirm = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "danger" | "warning" | "info";
    onConfirm: () => void;
  }) => {
    setDialog({
      isOpen: true,
      ...options,
      loading: false
    });
  };

  const hideConfirm = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const setLoading = (loading: boolean) => {
    setDialog(prev => ({ ...prev, loading }));
  };

  const handleConfirm = async () => {
    if (dialog.onConfirm) {
      setLoading(true);
      try {
        await dialog.onConfirm();
        hideConfirm();
      } catch (error) {
        console.error("Confirm action failed:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const ConfirmDialogComponent = () => (
    <ConfirmDialog
      isOpen={dialog.isOpen}
      title={dialog.title}
      message={dialog.message}
      confirmText={dialog.confirmText}
      cancelText={dialog.cancelText}
      type={dialog.type}
      onConfirm={handleConfirm}
      onCancel={hideConfirm}
      loading={dialog.loading}
    />
  );

  return {
    showConfirm,
    hideConfirm,
    ConfirmDialog: ConfirmDialogComponent
  };
};
