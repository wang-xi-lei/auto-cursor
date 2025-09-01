import React, { useState, useEffect } from "react";
import { AccountService } from "../services/accountService";
import { CursorService } from "../services/cursorService";
import type { AccountInfo, AccountListResult } from "../types/account";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Toast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { UsageDisplay } from "../components/UsageDisplay";

export const TokenManagePage: React.FC = () => {
  const [accountData, setAccountData] = useState<AccountListResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [cancelSubscriptionLoading, setCancelSubscriptionLoading] = useState<
    string | null
  >(null); // 存储正在处理的账户邮箱
  const [showAddForm, setShowAddForm] = useState(false);
  const [showQuickSwitchForm, setShowQuickSwitchForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newRefreshToken, setNewRefreshToken] = useState("");
  const [newWorkosSessionToken, setNewWorkosSessionToken] = useState("");
  const [editingAccount, setEditingAccount] = useState<AccountInfo | null>(
    null
  );
  const [editToken, setEditToken] = useState("");
  const [editRefreshToken, setEditRefreshToken] = useState("");
  const [editWorkosSessionToken, setEditWorkosSessionToken] = useState("");
  const [quickSwitchEmail, setQuickSwitchEmail] = useState("");
  const [quickSwitchToken, setQuickSwitchToken] = useState("");
  const [quickSwitchAuthType, setQuickSwitchAuthType] = useState("Auth_0");
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

    // 设置取消订阅事件监听器
    let cleanupListeners: (() => void) | null = null;

    const setupListeners = async () => {
      const { listen } = await import("@tauri-apps/api/event");

      const successUnlisten = await listen(
        "cancel-subscription-success",
        () => {
          console.log("Cancel subscription success event received");
          setCancelSubscriptionLoading(null);
          setToast({
            message: "取消订阅页面已打开，请继续完成操作",
            type: "success",
          });
        }
      );

      const failedUnlisten = await listen("cancel-subscription-failed", () => {
        console.log("Cancel subscription failed event received");
        setCancelSubscriptionLoading(null);
        setToast({
          message: "未找到取消订阅按钮，请手动操作",
          type: "error",
        });
      });

      cleanupListeners = () => {
        successUnlisten();
        failedUnlisten();
      };
    };

    setupListeners();

    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
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
      const result = await AccountService.addAccount(
        newEmail,
        newToken,
        newRefreshToken || undefined,
        newWorkosSessionToken || undefined
      );
      if (result.success) {
        setToast({ message: "账户添加成功", type: "success" });
        setNewEmail("");
        setNewToken("");
        setNewRefreshToken("");
        setNewWorkosSessionToken("");
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
      message: `确定要切换到账户 ${email} 吗？这将先执行完全重置，然后替换当前的登录信息。`,
      onConfirm: async () => {
        try {
          // 第一步：执行完全重置
          console.log("🔄 开始执行完全重置...");
          setToast({ message: "正在执行完全重置...", type: "success" });

          const resetResult = await CursorService.completeResetMachineIds();
          if (!resetResult.success) {
            setToast({
              message: `重置失败: ${resetResult.message}`,
              type: "error",
            });
            setConfirmDialog({ ...confirmDialog, show: false });
            return;
          }

          console.log("✅ 完全重置成功，开始切换账户...");
          setToast({ message: "重置成功，正在切换账户...", type: "success" });

          // 第二步：切换账户
          const result = await AccountService.switchAccount(email);
          if (result.success) {
            setToast({
              message: "账户切换成功！请重启Cursor查看效果。",
              type: "success",
            });
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

  const handleQuickSwitch = async () => {
    if (!quickSwitchEmail || !quickSwitchToken) {
      setToast({ message: "请填写邮箱和Token", type: "error" });
      return;
    }

    if (!quickSwitchEmail.includes("@")) {
      setToast({ message: "请输入有效的邮箱地址", type: "error" });
      return;
    }

    setConfirmDialog({
      show: true,
      title: "快速切换账户",
      message: `确定要切换到账户 ${quickSwitchEmail} 吗？这将先执行完全重置，然后直接使用提供的Token登录。`,
      onConfirm: async () => {
        try {
          // 第一步：执行完全重置
          console.log("🔄 开始执行完全重置...");
          setToast({ message: "正在执行完全重置...", type: "success" });

          const resetResult = await CursorService.completeResetMachineIds();
          if (!resetResult.success) {
            setToast({
              message: `重置失败: ${resetResult.message}`,
              type: "error",
            });
            setConfirmDialog({ ...confirmDialog, show: false });
            return;
          }

          console.log("✅ 完全重置成功，开始快速切换账户...");
          setToast({ message: "重置成功，正在切换账户...", type: "success" });

          // 第二步：快速切换账户
          const result = await AccountService.switchAccountWithToken(
            quickSwitchEmail,
            quickSwitchToken,
            quickSwitchAuthType
          );
          if (result.success) {
            setToast({
              message: "账户切换成功！请重启Cursor查看效果。",
              type: "success",
            });
            setQuickSwitchEmail("");
            setQuickSwitchToken("");
            setShowQuickSwitchForm(false);
            await loadAccounts();
          } else {
            setToast({ message: result.message, type: "error" });
          }
        } catch (error) {
          console.error("Failed to quick switch account:", error);
          setToast({ message: "快速切换失败", type: "error" });
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

  const handleLogout = async () => {
    setConfirmDialog({
      show: true,
      title: "退出登录",
      message:
        "确定要退出当前账户吗？这将清除所有认证信息，需要重新登录Cursor。",
      onConfirm: async () => {
        try {
          const result = await AccountService.logoutCurrentAccount();
          if (result.success) {
            setToast({
              message: "退出登录成功，请重启Cursor完成退出",
              type: "success",
            });
            await loadAccounts();
          } else {
            setToast({ message: result.message, type: "error" });
          }

          // Show detailed results if available
          if (result.details && result.details.length > 0) {
            console.log("Logout details:", result.details);
          }
        } catch (error) {
          console.error("Failed to logout:", error);
          setToast({ message: "退出登录失败", type: "error" });
        }
        setConfirmDialog({ ...confirmDialog, show: false });
      },
    });
  };

  const handleDeleteCursorAccount = async (account: AccountInfo) => {
    if (!account.workos_cursor_session_token) {
      setToast({
        message: "该账户没有 WorkOS Session Token，无法注销",
        type: "error",
      });
      return;
    }

    setConfirmDialog({
      show: true,
      title: "注销 Cursor 账户",
      message: `确定要注销账户 ${account.email} 吗？此操作将永久删除该 Cursor 账户，无法撤销！`,
      onConfirm: async () => {
        try {
          const result = await AccountService.deleteAccount(
            account.workos_cursor_session_token!
          );
          await AccountService.removeAccount(account.email);
          if (result.success) {
            setToast({
              message: "账户注销成功！",
              type: "success",
            });
            await loadAccounts();
          } else {
            setToast({ message: result.message, type: "error" });
          }
        } catch (error) {
          console.error("Failed to delete cursor account:", error);
          setToast({ message: "注销账户失败", type: "error" });
        }
        setConfirmDialog({ ...confirmDialog, show: false });
      },
    });
  };

  const handleCancelSubscription = async (account: AccountInfo) => {
    if (!account.workos_cursor_session_token) {
      setToast({
        message: "该账户没有 WorkOS Session Token，无法取消订阅",
        type: "error",
      });
      return;
    }

    try {
      setCancelSubscriptionLoading(account.email);
      setToast({
        message: "正在打开取消订阅页面，请稍候...",
        type: "success",
      });

      const result = await AccountService.openCancelSubscriptionPage(
        account.workos_cursor_session_token
      );

      if (result.success) {
        // 不要关闭 toast，等待 Rust 端的事件响应
        // setToast 会在事件监听器中处理
      } else {
        setCancelSubscriptionLoading(null);
        setToast({
          message: result.message,
          type: "error",
        });
      }
    } catch (error) {
      console.error("Failed to open cancel subscription page:", error);
      setCancelSubscriptionLoading(null);
      setToast({
        message: "打开取消订阅页面失败",
        type: "error",
      });
    }
  };

  const handleEditAccount = (account: AccountInfo) => {
    console.log("🔍 [DEBUG] handleEditAccount called with account:", account);

    setEditingAccount(account);
    setEditToken(account.token);
    setEditRefreshToken(account.refresh_token || "");
    setEditWorkosSessionToken(account.workos_cursor_session_token || "");
    setShowEditForm(true);
  };

  const handleSaveEdit = async () => {
    if (!editingAccount) return;
    console.log(
      "🔍 [DEBUG] handleSaveEdit called with editingAccount:",
      editingAccount
    );

    try {
      // Determine what to update
      const tokenChanged = editToken !== editingAccount.token;
      const refreshTokenChanged =
        editRefreshToken !== (editingAccount.refresh_token || "");
      const workosSessionTokenChanged =
        editWorkosSessionToken !==
        (editingAccount.workos_cursor_session_token || "");

      console.log("Edit save:", {
        email: editingAccount.email,
        tokenChanged,
        refreshTokenChanged,
        workosSessionTokenChanged,
        editToken: editToken.substring(0, 10) + "...",
        editRefreshToken: editRefreshToken.substring(0, 10) + "...",
        editWorkosSessionToken: editWorkosSessionToken.substring(0, 10) + "...",
        originalToken: editingAccount.token.substring(0, 10) + "...",
        originalRefreshToken:
          (editingAccount.refresh_token || "").substring(0, 10) + "...",
        originalWorkosSessionToken:
          (editingAccount.workos_cursor_session_token || "").substring(0, 10) +
          "...",
      });

      const result = await AccountService.editAccount(
        editingAccount.email,
        tokenChanged ? editToken : undefined,
        refreshTokenChanged ? editRefreshToken || undefined : undefined,
        workosSessionTokenChanged
          ? editWorkosSessionToken || undefined
          : undefined
      );

      if (result.success) {
        setToast({ message: "账户更新成功", type: "success" });
        setShowEditForm(false);
        setEditingAccount(null);
        setEditToken("");
        setEditRefreshToken("");
        setEditWorkosSessionToken("");
        await loadAccounts();
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (error) {
      console.error("Failed to edit account:", error);
      setToast({ message: "更新账户失败", type: "error" });
    }
  };

  const handleCancelEdit = () => {
    setShowEditForm(false);
    setEditingAccount(null);
    setEditToken("");
    setEditRefreshToken("");
    setEditWorkosSessionToken("");
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
              <div className="flex items-center justify-between">
                <h4 className="mb-2 font-medium text-blue-900 text-md">
                  📧 当前账户
                </h4>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center px-3 py-1 text-xs font-medium text-red-700 bg-red-100 border border-transparent rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  🚪 退出登录
                </button>
              </div>
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

          {/* Usage Display Section */}
          {accountData?.current_account && (
            <div className="mb-6">
              <UsageDisplay
                token={accountData.current_account.token}
                className="mb-4"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex mb-4 space-x-3">
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ➕ 添加账户
            </button>
            <button
              type="button"
              onClick={() => setShowQuickSwitchForm(!showQuickSwitchForm)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              🚀 快速切换
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
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Refresh Token (可选)
                  </label>
                  <textarea
                    value={newRefreshToken}
                    onChange={(e) => setNewRefreshToken(e.target.value)}
                    rows={3}
                    className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入Refresh Token (可选)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    WorkOS Session Token (可选)
                  </label>
                  <textarea
                    value={newWorkosSessionToken}
                    onChange={(e) => setNewWorkosSessionToken(e.target.value)}
                    rows={3}
                    className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入WorkOS Session Token (可选，用于注销账户)"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleAddAccount}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    ✅ 添加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewEmail("");
                      setNewToken("");
                      setNewRefreshToken("");
                      setNewWorkosSessionToken("");
                    }}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    ❌ 取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Switch Form */}
          {showQuickSwitchForm && (
            <div className="p-4 mb-6 border rounded-lg bg-green-50">
              <h4 className="mb-3 font-medium text-gray-900 text-md">
                🚀 快速切换账户
              </h4>
              <p className="mb-3 text-sm text-gray-600">
                直接输入邮箱和Token进行账户切换，无需先添加到账户列表
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={quickSwitchEmail}
                    onChange={(e) => setQuickSwitchEmail(e.target.value)}
                    placeholder="your-email@example.com"
                    className="block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Access Token
                  </label>
                  <textarea
                    value={quickSwitchToken}
                    onChange={(e) => setQuickSwitchToken(e.target.value)}
                    placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                    rows={3}
                    className="block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="auth-type-select"
                    className="block text-sm font-medium text-gray-700"
                  >
                    认证类型
                  </label>
                  <select
                    id="auth-type-select"
                    value={quickSwitchAuthType}
                    onChange={(e) => setQuickSwitchAuthType(e.target.value)}
                    className="block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="Auth_0">Auth_0 (默认)</option>
                    <option value="Google">Google</option>
                    <option value="GitHub">GitHub</option>
                  </select>
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleQuickSwitch}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    🚀 立即切换
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickSwitchForm(false);
                      setQuickSwitchEmail("");
                      setQuickSwitchToken("");
                      setQuickSwitchAuthType("Auth_0");
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
                      account.is_current &&
                      accountData?.current_account &&
                      account.token == accountData?.current_account.token
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
                          {account.is_current &&
                            accountData?.current_account &&
                            account.token ==
                              accountData?.current_account.token && (
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
                        {account.refresh_token && (
                          <p className="text-xs text-gray-500">
                            Refresh Token:{" "}
                            {account.refresh_token.substring(0, 20)}...
                          </p>
                        )}
                        {account.workos_cursor_session_token && (
                          <p className="text-xs text-gray-500">
                            WorkOS Session Token:{" "}
                            {account.workos_cursor_session_token.substring(
                              0,
                              20
                            )}
                            ...
                          </p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => handleEditAccount(account)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 border border-transparent rounded hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                        >
                          ✏️ 编辑
                        </button>
                        {account.workos_cursor_session_token && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCancelSubscription(account)}
                              disabled={
                                cancelSubscriptionLoading === account.email
                              }
                              className={`inline-flex items-center px-3 py-1 text-xs font-medium border border-transparent rounded focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                cancelSubscriptionLoading === account.email
                                  ? "text-gray-500 bg-gray-100 cursor-not-allowed"
                                  : "text-orange-700 bg-orange-100 hover:bg-orange-200 focus:ring-orange-500"
                              }`}
                            >
                              {cancelSubscriptionLoading === account.email
                                ? "🔄 处理中..."
                                : "📋 取消订阅"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCursorAccount(account)}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-red-700 bg-red-100 border border-transparent rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              🚨 注销账户
                            </button>
                          </>
                        )}
                        {account.is_current &&
                        accountData?.current_account &&
                        account.token == accountData?.current_account.token ? (
                          ""
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSwitchAccount(account.email)}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 border border-transparent rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              🔄 切换
                            </button>
                            <button
                              type="button"
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

      {/* Edit Account Modal */}
      {showEditForm && editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
            <h3 className="mb-4 text-lg font-medium text-gray-900">
              编辑账户: {editingAccount.email}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Token
                </label>
                <textarea
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  rows={3}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="请输入Token"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Refresh Token (可选)
                </label>
                <textarea
                  value={editRefreshToken}
                  onChange={(e) => setEditRefreshToken(e.target.value)}
                  rows={3}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="请输入Refresh Token (可选)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  WorkOS Session Token (可选)
                </label>
                <textarea
                  value={editWorkosSessionToken}
                  onChange={(e) => setEditWorkosSessionToken(e.target.value)}
                  rows={3}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="请输入WorkOS Session Token (可选，用于注销账户)"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
