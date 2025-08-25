import React, { useState, useEffect } from "react";
import { AccountService } from "../services/accountService";
import type { AccountInfo, AccountListResult } from "../types/account";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Toast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";

export const TokenManagePage: React.FC = () => {
  const [accountData, setAccountData] = useState<AccountListResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newToken, setNewToken] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", onConfirm: () => {} });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const result = await AccountService.getAccountList();
      setAccountData(result);
    } catch (error) {
      console.error("Failed to load accounts:", error);
      setToast({ message: "加载账户列表失败", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newEmail || !newToken) {
      setToast({ message: "请填写邮箱和Token", type: "error" });
      return;
    }

    if (!newEmail.includes("@")) {
      setToast({ message: "请输入有效的邮箱地址", type: "error" });
      return;
    }

    try {
      const result = await AccountService.addAccount(newEmail, newToken);
      if (result.success) {
        setToast({ message: "账户添加成功", type: "success" });
        setNewEmail("");
        setNewToken("");
        setShowAddForm(false);
        await loadAccounts();
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (error) {
      console.error("Failed to add account:", error);
      setToast({ message: "添加账户失败", type: "error" });
    }
  };

  const handleSwitchAccount = async (email: string) => {
    setConfirmDialog({
      show: true,
      title: "切换账户",
      message: `确定要切换到账户 ${email} 吗？这将替换当前的登录信息。`,
      onConfirm: async () => {
        try {
          const result = await AccountService.switchAccount(email);
          if (result.success) {
            setToast({ message: "账户切换成功", type: "success" });
            await loadAccounts();
          } else {
            setToast({ message: result.message, type: "error" });
          }
        } catch (error) {
          console.error("Failed to switch account:", error);
          setToast({ message: "切换账户失败", type: "error" });
        }
        setConfirmDialog({ ...confirmDialog, show: false });
      },
    });
  };

  const handleRemoveAccount = async (email: string) => {
    setConfirmDialog({
      show: true,
      title: "删除账户",
      message: `确定要删除账户 ${email} 吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          const result = await AccountService.removeAccount(email);
          if (result.success) {
            setToast({ message: "账户删除成功", type: "success" });
            await loadAccounts();
          } else {
            setToast({ message: result.message, type: "error" });
          }
        } catch (error) {
          console.error("Failed to remove account:", error);
          setToast({ message: "删除账户失败", type: "error" });
        }
        setConfirmDialog({ ...confirmDialog, show: false });
      },
    });
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("zh-CN");
    } catch {
      return dateString;
    }
  };

  const getRemainingDays = (account: AccountInfo) => {
    // This would need to be implemented based on your token validation logic
    // For now, return a placeholder
    return "未知";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="mb-4 text-lg font-medium leading-6 text-gray-900">
            🔐 Token 管理
          </h3>

          {/* Current Account Section */}
          {accountData?.current_account && (
            <div className="p-4 mb-6 border border-blue-200 rounded-lg bg-blue-50">
              <h4 className="mb-2 font-medium text-blue-900 text-md">
                📧 当前账户
              </h4>
              <div className="text-sm text-blue-800">
                <p>
                  <strong>邮箱:</strong> {accountData.current_account.email}
                </p>
                <p>
                  <strong>剩余天数:</strong>{" "}
                  {getRemainingDays(accountData.current_account)}
                </p>
              </div>
            </div>
          )}

          {/* Add Account Button */}
          <div className="mb-4">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ➕ 添加账户
            </button>
          </div>

          {/* Add Account Form */}
          {showAddForm && (
            <div className="p-4 mb-6 border rounded-lg bg-gray-50">
              <h4 className="mb-3 font-medium text-gray-900 text-md">
                添加新账户
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入邮箱地址"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Token
                  </label>
                  <textarea
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    rows={3}
                    className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入Token"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleAddAccount}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    ✅ 添加
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewEmail("");
                      setNewToken("");
                    }}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    ❌ 取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Account List */}
          <div>
            <h4 className="mb-3 font-medium text-gray-900 text-md">账户列表</h4>
            {accountData?.accounts && accountData.accounts.length > 0 ? (
              <div className="space-y-3">
                {accountData.accounts.map((account, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      account.is_current
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            {account.email}
                          </span>
                          {account.is_current && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              当前账户
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          添加时间: {formatDate(account.created_at)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Token: {account.token.substring(0, 20)}...
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        {!account.is_current && (
                          <>
                            <button
                              onClick={() => handleSwitchAccount(account.email)}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 border border-transparent rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              🔄 切换
                            </button>
                            <button
                              onClick={() => handleRemoveAccount(account.email)}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-red-700 bg-red-100 border border-transparent rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              🗑️ 删除
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">暂无保存的账户</p>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confirm Dialog */}
      {confirmDialog.show && (
        <ConfirmDialog
          isOpen={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog({ ...confirmDialog, show: false })}
        />
      )}
    </div>
  );
};
