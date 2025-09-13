import React, { useState, useEffect, useRef } from "react";
import { AccountService } from "../services/accountService";
import { CursorService } from "../services/cursorService";
import type { AccountInfo, AccountListResult } from "../types/account";
import type { AggregatedUsageData } from "../types/usage";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Toast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { UsageDisplay } from "../components/UsageDisplay";
import { AggregatedUsageDisplay } from "../components/AggregatedUsageDisplay";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { base64URLEncode, K, sha256 } from "../utils/cursorToken";
import { confirm } from "@tauri-apps/plugin-dialog";

export const TokenManagePage: React.FC = () => {
  const [accountData, setAccountData] = useState<AccountListResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [cancelSubscriptionLoading, setCancelSubscriptionLoading] = useState<
    string | null
  >(null); // 存储正在处理的账户邮箱
  const [manualBindCardLoading, setManualBindCardLoading] = useState<
    string | null
  >(null); // 存储正在处理手动绑卡的账户邮箱
  const [showAddForm, setShowAddForm] = useState(false);
  const [showQuickSwitchForm, setShowQuickSwitchForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [addAccountType, setAddAccountType] = useState<"token" | "email">(
    "token"
  ); // 新增：添加账户类型选择
  const [newEmail, setNewEmail] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newPassword, setNewPassword] = useState(""); // 新增：密码字段
  const [newRefreshToken, setNewRefreshToken] = useState("");
  const [newWorkosSessionToken, setNewWorkosSessionToken] = useState("");
  const [autoLoginLoading, setAutoLoginLoading] = useState(false); // 新增：自动登录loading状态
  const [showLoginWindow, setShowLoginWindow] = useState(false); // 新增：是否显示登录窗口
  const [_autoLoginTimeout, setAutoLoginTimeout] = useState(false); // 新增：30秒超时状态
  const [showCancelLoginButton, setShowCancelLoginButton] = useState(false); // 新增：是否显示取消登录按钮
  const [openMenuEmail, setOpenMenuEmail] = useState<string | null>(null); // 新增：控制哪个账户的操作菜单打开
  const [usageModalOpen, setUsageModalOpen] = useState(false); // 新增：用量modal状态
  const [selectedAccountUsage, setSelectedAccountUsage] = useState<{
    account: AccountInfo;
    usageData: AggregatedUsageData | null;
    loading: boolean;
  } | null>(null); // 新增：选中账户的用量数据
  const [selectedPeriod, setSelectedPeriod] = useState<
    "7days" | "30days" | "thisMonth" | "custom"
  >("30days"); // 新增：时间段选择
  const [customStartDate, setCustomStartDate] = useState(""); // 新增：自定义开始日期
  const [customEndDate, setCustomEndDate] = useState(""); // 新增：自定义结束日期
  const currentEmailRef = useRef<string>(""); // 用于在事件监听器中访问当前邮箱
  const autoLoginTimerRef = useRef<number | null>(null); // 新增：超时计时器引用
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

      // 手动绑卡事件监听器
      const bindCardSuccessUnlisten = await listen(
        "manual-bind-card-success",
        () => {
          console.log("Manual bind card success event received");
          setManualBindCardLoading(null);
          setToast({
            message: "手动绑卡页面已打开，请继续完成操作",
            type: "success",
          });
        }
      );

      const bindCardFailedUnlisten = await listen(
        "manual-bind-card-failed",
        () => {
          console.log("Manual bind card failed event received");
          setManualBindCardLoading(null);
          setTimeout(() => {
            setToast({
              message: "未找到开始试用按钮，可能已经绑卡！",
              type: "error",
            });
          }, 1000);
        }
      );

      // 自动登录事件监听器
      const autoLoginSuccessUnlisten = await listen(
        "auto-login-success",
        async (event: any) => {
          console.log("Auto login success event received", event.payload);

          // 清除超时计时器
          if (autoLoginTimerRef.current) {
            window.clearTimeout(autoLoginTimerRef.current);
          }

          const webToken = event.payload?.token;
          if (webToken) {
            // 显示获取AccessToken的提示
            setToast({
              message: "WebToken获取成功！正在获取AccessToken...",
              type: "success",
            });

            try {
              // 获取AccessToken
              const accessTokenData = await getClientAccessToken(webToken);
              console.log("AccessToken data:", accessTokenData);

              if (accessTokenData && (accessTokenData as any).accessToken) {
                const accessToken = (accessTokenData as any).accessToken;
                const refreshToken =
                  (accessTokenData as any).refreshToken || accessToken;

                // 显示保存账户的提示
                setToast({
                  message: "AccessToken获取成功！正在保存账户信息...",
                  type: "success",
                });

                // 自动保存账户 - 使用ref中的邮箱
                const currentEmail = currentEmailRef.current; // 从ref获取当前邮箱
                console.log(currentEmail, "currentEmail");
                const result = await AccountService.addAccount(
                  currentEmail,
                  accessToken,
                  refreshToken,
                  webToken
                );

                if (result.success) {
                  setToast({
                    message: "账户添加成功！所有Token已自动获取并保存",
                    type: "success",
                  });

                  await confirm(
                    "账户添加成功：\n\n" +
                      `${currentEmail}账户所有Token已自动获取并保存\n`,
                    {
                      title: "账户添加成功",
                      kind: "info",
                    }
                  );

                  // 清空表单并关闭
                  setNewEmail("");
                  setNewPassword("");
                  setNewToken("");
                  setNewRefreshToken("");
                  setNewWorkosSessionToken("");
                  currentEmailRef.current = ""; // 也清空ref
                  setShowAddForm(false);
                  setAutoLoginLoading(false);
                  setAutoLoginTimeout(false);
                  setShowCancelLoginButton(false);
                  setShowLoginWindow(false);

                  // 刷新账户列表
                  await loadAccounts();
                } else {
                  setToast({
                    message: `保存账户失败: ${result.message}`,
                    type: "error",
                  });
                  setAutoLoginLoading(false);
                  setAutoLoginTimeout(false);
                  setShowCancelLoginButton(false);
                }
              } else {
                // 如果获取AccessToken失败，至少保存WebToken
                setNewWorkosSessionToken(webToken);
                setToast({
                  message: "获取AccessToken失败，但WebToken已填充，请手动添加",
                  type: "error",
                });
                setAutoLoginLoading(false);
                setAutoLoginTimeout(false);
                setShowCancelLoginButton(false);
              }
            } catch (error) {
              console.error("获取AccessToken失败:", error);
              // 如果获取AccessToken失败，至少保存WebToken
              setNewWorkosSessionToken(webToken);
              setToast({
                message: "获取AccessToken失败，但WebToken已填充，请手动添加",
                type: "error",
              });
              setAutoLoginLoading(false);
              setAutoLoginTimeout(false);
              setShowCancelLoginButton(false);
            }
          } else {
            setAutoLoginLoading(false);
            setAutoLoginTimeout(false);
            setShowCancelLoginButton(false);
          }
        }
      );

      const autoLoginFailedUnlisten = await listen(
        "auto-login-failed",
        (event: any) => {
          console.log("Auto login failed event received", event.payload);

          // 清除超时计时器
          if (autoLoginTimerRef.current) {
            window.clearTimeout(autoLoginTimerRef.current);
          }

          setAutoLoginLoading(false);
          setAutoLoginTimeout(false);
          setShowCancelLoginButton(false);
          setToast({
            message: `自动登录失败: ${event.payload?.error || "未知错误"}`,
            type: "error",
          });
        }
      );

      cleanupListeners = () => {
        successUnlisten();
        failedUnlisten();
        bindCardSuccessUnlisten();
        bindCardFailedUnlisten();
        autoLoginSuccessUnlisten();
        autoLoginFailedUnlisten();
      };
    };

    setupListeners();

    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
  }, []);

  // 监听点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (openMenuEmail && !target.closest(".dropdown-menu")) {
        setOpenMenuEmail(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuEmail]);

  // 根据webToken获取客户端accessToken
  const getClientAccessToken = (workos_cursor_session_token: string) => {
    return new Promise(async (resolve, _reject) => {
      try {
        let verifier = base64URLEncode(K);
        let challenge = base64URLEncode(new Uint8Array(await sha256(verifier)));
        let uuid = crypto.randomUUID();

        // 轮询查token
        let interval = setInterval(() => {
          invoke("trigger_authorization_login_poll", {
            uuid,
            verifier,
          })
            .then((res: any) => {
              console.log(res, "trigger_authorization_login_poll res");
              if (res.success) {
                const data = JSON.parse(res.response_body);
                console.log(data, "access token data");
                resolve(data);
                clearInterval(interval);
              }
            })
            .catch((error) => {
              console.error("轮询获取token失败:", error);
            });
        }, 1000);

        // 20秒后清除定时器
        setTimeout(() => {
          clearInterval(interval);
          resolve(null);
        }, 1000 * 20);

        // 触发授权登录-rust
        await invoke("trigger_authorization_login", {
          uuid,
          challenge,
          workosCursorSessionToken: workos_cursor_session_token,
        });
      } catch (error) {
        console.error("getClientAccessToken error:", error);
        resolve(null);
      }
    });
  };

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
    if (!newEmail) {
      setToast({ message: "请填写邮箱地址", type: "error" });
      return;
    }

    if (!newEmail.includes("@")) {
      setToast({ message: "请输入有效的邮箱地址", type: "error" });
      return;
    }

    // 根据添加类型进行不同的验证
    if (addAccountType === "token") {
      if (!newToken) {
        setToast({ message: "请填写Token", type: "error" });
        return;
      }
    } else if (addAccountType === "email") {
      if (!newPassword) {
        setToast({ message: "请填写密码", type: "error" });
        return;
      }
      // 执行自动登录获取token
      await handleAutoLogin();
      return; // 自动登录完成后会自动填充token，用户可以再次点击添加
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
        setNewPassword("");
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

  const handleAutoLogin = async () => {
    if (!newEmail || !newPassword) {
      setToast({ message: "请填写邮箱和密码", type: "error" });
      return;
    }

    try {
      setAutoLoginLoading(true);
      setAutoLoginTimeout(false);
      setShowCancelLoginButton(false);
      setToast({
        message: "正在后台执行自动登录，请稍候...",
        type: "success",
      });

      // 启动30秒超时计时器
      if (autoLoginTimerRef.current) {
        window.clearTimeout(autoLoginTimerRef.current);
      }

      autoLoginTimerRef.current = window.setTimeout(() => {
        console.log("自动登录30秒超时");
        setAutoLoginTimeout(true);
        setShowCancelLoginButton(true);
        setToast({
          message: "自动登录超时（30秒），如需要可以点击取消登录",
          type: "error",
        });
        confirm(
          "自动登录超时（30秒），如需要可以点击取消登录或者显示窗口查看是否遇到了验证码或者人机验证，如果有完成操作后手动登录也会自动获取token",
          {
            title: "自动登录超时",
            kind: "error",
          }
        );
      }, 30000); // 30秒

      // 调用Rust后端的自动登录函数
      const result = await invoke("auto_login_and_get_cookie", {
        email: newEmail,
        password: newPassword,
        showWindow: showLoginWindow,
      });

      console.log("Auto login result:", result);
    } catch (error) {
      console.error("Failed to start auto login:", error);
      // 清除计时器
      if (autoLoginTimerRef.current) {
        window.window.clearTimeout(autoLoginTimerRef.current);
      }
      setAutoLoginLoading(false);
      setAutoLoginTimeout(false);
      setShowCancelLoginButton(false);
      setToast({
        message: "启动自动登录失败",
        type: "error",
      });
    }
  };

  // 新增：取消自动登录函数
  const handleCancelAutoLogin = async () => {
    setConfirmDialog({
      show: true,
      title: "取消自动登录",
      message: "确定要取消当前的自动登录操作吗？",
      onConfirm: async () => {
        try {
          // 清除计时器
          if (autoLoginTimerRef.current) {
            window.clearTimeout(autoLoginTimerRef.current);
          }

          // 调用后端取消自动登录
          await invoke("auto_login_failed", { error: "用户手动取消" });

          // 重置状态
          setAutoLoginLoading(false);
          setAutoLoginTimeout(false);
          setShowCancelLoginButton(false);

          // 默认勾选显示窗口选项
          setShowLoginWindow(true);

          setToast({
            message: "已取消自动登录，下次将显示登录窗口",
            type: "success",
          });
        } catch (error) {
          console.error("Failed to cancel auto login:", error);
          setToast({
            message: "取消登录失败",
            type: "error",
          });
        }
        setConfirmDialog({ ...confirmDialog, show: false });
      },
    });
  };

  // 新增：显示自动登录窗口函数
  const handleShowAutoLoginWindow = async () => {
    try {
      await invoke("show_auto_login_window");
      setToast({
        message: "自动登录窗口已显示",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to show auto login window:", error);
      setToast({
        message: "显示窗口失败，可能窗口已关闭",
        type: "error",
      });
    }
  };

  // 新增：查看Cursor主页函数
  const handleViewDashboard = async (account: AccountInfo) => {
    if (!account.workos_cursor_session_token) {
      setToast({
        message: "该账户没有WorkOS Session Token，无法查看主页",
        type: "error",
      });
      return;
    }

    try {
      const result = await invoke("open_cursor_dashboard", {
        workosCursorSessionToken: account.workos_cursor_session_token,
      });
      console.log("Dashboard result:", result);
      setToast({
        message: "Cursor主页已打开",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to open dashboard:", error);
      setToast({
        message: "打开主页失败",
        type: "error",
      });
    }
  };

  // 新增：计算日期范围
  const getDateRange = (
    period: "7days" | "30days" | "thisMonth" | "custom"
  ) => {
    const now = new Date();
    let startDate: number;
    let endDate: number;

    switch (period) {
      case "7days":
        endDate = Math.floor(now.getTime());
        startDate = endDate - 7 * 24 * 60 * 60 * 1000;
        break;
      case "30days":
        endDate = Math.floor(now.getTime());
        startDate = endDate - 30 * 24 * 60 * 60 * 1000;
        break;
      case "thisMonth":
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = Math.floor(thisMonth.getTime());
        endDate = Math.floor(now.getTime());
        break;
      case "custom":
        if (!customStartDate || !customEndDate) {
          return null;
        }
        startDate = Math.floor(new Date(customStartDate).getTime());
        endDate = Math.floor(new Date(customEndDate + " 23:59:59").getTime());
        break;
      default:
        endDate = Math.floor(now.getTime());
        startDate = endDate - 30 * 24 * 60 * 60 * 1000;
    }

    return { startDate, endDate };
  };

  // 新增：获取用量数据
  const fetchUsageData = async (
    account: AccountInfo,
    period: "7days" | "30days" | "thisMonth" | "custom"
  ) => {
    const dateRange = getDateRange(period);
    if (!dateRange) {
      setToast({
        message: "请选择有效的日期范围",
        type: "error",
      });
      return;
    }

    try {
      setSelectedAccountUsage({
        account,
        usageData: null,
        loading: true,
      });

      const teamId = 1; // 默认team_id

      const result = await invoke("get_usage_for_period", {
        token: account.token,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        teamId,
      });

      console.log("Usage result:", result);

      if (result && (result as any).success) {
        setSelectedAccountUsage({
          account,
          usageData: (result as any).data,
          loading: false,
        });
        setToast({
          message: "用量数据加载成功",
          type: "success",
        });
      } else {
        setSelectedAccountUsage({
          account,
          usageData: null,
          loading: false,
        });
        setToast({
          message: (result as any)?.message || "获取用量数据失败",
          type: "error",
        });
      }
    } catch (error) {
      console.error("Failed to get usage data:", error);
      setSelectedAccountUsage({
        account,
        usageData: null,
        loading: false,
      });
      setToast({
        message: "获取用量数据失败",
        type: "error",
      });
    }
  };

  // 新增：查看用量函数
  const handleViewUsage = async (account: AccountInfo) => {
    if (!account.token) {
      setToast({
        message: "该账户没有Token，无法查看用量",
        type: "error",
      });
      return;
    }

    setUsageModalOpen(true);
    setSelectedPeriod("30days"); // 默认选择30天
    await fetchUsageData(account, "30days");
  };

  // 新增：切换时间段
  const handlePeriodChange = async (
    period: "7days" | "30days" | "thisMonth" | "custom"
  ) => {
    setSelectedPeriod(period);
    if (selectedAccountUsage && period !== "custom") {
      await fetchUsageData(selectedAccountUsage.account, period);
    }
  };

  // 新增：应用自定义日期范围
  const handleApplyCustomDate = async () => {
    if (selectedAccountUsage) {
      await fetchUsageData(selectedAccountUsage.account, "custom");
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

  const handleManualBindCard = async (account: AccountInfo) => {
    if (!account.workos_cursor_session_token) {
      setToast({
        message: "该账户没有 WorkOS Session Token，无法进行手动绑卡",
        type: "error",
      });
      return;
    }

    try {
      setManualBindCardLoading(account.email);
      setToast({
        message: "正在打开手动绑卡页面，请稍候...",
        type: "success",
      });

      const result = await AccountService.openManualBindCardPage(
        account.workos_cursor_session_token
      );

      if (result.success) {
        // 不要关闭 toast，等待 Rust 端的事件响应
        // setToast 会在事件监听器中处理
      } else {
        setManualBindCardLoading(null);
        setToast({
          message: result.message,
          type: "error",
        });
      }
    } catch (error) {
      console.error("Failed to open manual bind card page:", error);
      setManualBindCardLoading(null);
      setToast({
        message: "打开手动绑卡页面失败",
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

  const handleExportAccounts = async () => {
    try {
      // 使用Tauri 2的dialog插件选择导出目录
      const selectedPath = await open({
        multiple: false,
        directory: true,
        title: "选择导出目录",
      });

      if (!selectedPath) {
        return; // 用户取消选择
      }

      const result = await AccountService.exportAccounts(selectedPath);
      if (result.success) {
        setToast({
          message: `账户导出成功！文件保存在：${result.exported_path}`,
          type: "success",
        });
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (error) {
      console.error("Failed to export accounts:", error);
      setToast({ message: "导出账户失败", type: "error" });
    }
  };

  const handleImportAccounts = async () => {
    setConfirmDialog({
      show: true,
      title: "导入账户",
      message:
        "导入将会覆盖当前的账户文件，原文件将备份为account_back.json。确定要继续吗？",
      onConfirm: async () => {
        try {
          // 使用Tauri 2的dialog插件选择要导入的文件
          const selectedFile = await open({
            multiple: false,
            directory: false,
            filters: [
              {
                name: "JSON Files",
                extensions: ["json"],
              },
            ],
            title: "选择要导入的account.json文件",
          });

          if (!selectedFile) {
            setConfirmDialog({ ...confirmDialog, show: false });
            return; // 用户取消选择
          }

          // 验证文件名是否为account.json
          const fileName =
            selectedFile.split("/").pop() ||
            selectedFile.split("\\").pop() ||
            "";
          if (fileName !== "account.json") {
            setToast({
              message: "请选择名为 account.json 的文件",
              type: "error",
            });
            setConfirmDialog({ ...confirmDialog, show: false });
            return;
          }

          const result = await AccountService.importAccounts(selectedFile);
          if (result.success) {
            setToast({
              message: result.message,
              type: "success",
            });
            // 重新加载账户列表
            await loadAccounts();
          } else {
            setToast({ message: result.message, type: "error" });
          }
        } catch (error) {
          console.error("Failed to import accounts:", error);
          setToast({ message: "导入账户失败", type: "error" });
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

  const getRemainingDays = (_account: AccountInfo) => {
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
          <div className="flex flex-wrap gap-3 mb-4">
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
            <button
              type="button"
              onClick={handleExportAccounts}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              📤 导出账户
            </button>
            <button
              type="button"
              onClick={handleImportAccounts}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              📥 导入账户
            </button>
          </div>

          {/* Add Account Form */}
          {showAddForm && (
            <div className="p-4 mb-6 border rounded-lg bg-gray-50">
              <h4 className="mb-3 font-medium text-gray-900 text-md">
                添加新账户
              </h4>

              {/* 添加类型选择 */}
              <div className="mb-4">
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  添加方式
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="addAccountType"
                      value="token"
                      checked={addAccountType === "token"}
                      onChange={(e) =>
                        setAddAccountType(e.target.value as "token" | "email")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">🔑 使用Token</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="addAccountType"
                      value="email"
                      checked={addAccountType === "email"}
                      onChange={(e) =>
                        setAddAccountType(e.target.value as "token" | "email")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      📧 使用邮箱密码{" "}
                      <span className="text-xs text-gray-500">
                        （ip需要纯净最好是直连或者干净的代理不然容易失败）
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      currentEmailRef.current = e.target.value; // 同时更新ref
                    }}
                    className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入邮箱地址"
                  />
                </div>
                {/* 根据添加类型显示不同的输入框 */}
                {addAccountType === "token" ? (
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
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      密码
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="请输入密码"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      将自动登录获取所有Token并保存账户：
                      <br />
                      1. 获取 WorkOS Session Token
                      <br />
                      2. 获取 Access Token 和 Refresh Token
                      <br />
                      3. 自动保存完整账户信息
                    </p>

                    {/* 显示窗口选项 */}
                    <div className="mt-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={showLoginWindow}
                          onChange={(e) => setShowLoginWindow(e.target.checked)}
                          className="mr-2 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-600">
                          显示登录窗口 (如果获取失败可勾选此项查看原因)
                        </span>
                      </label>
                    </div>
                  </div>
                )}
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
                    disabled={autoLoginLoading}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      autoLoginLoading
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                    }`}
                  >
                    {autoLoginLoading ? (
                      <>
                        🔄{" "}
                        {addAccountType === "email"
                          ? "自动登录获取中..."
                          : "处理中..."}
                      </>
                    ) : (
                      <>
                        ✅{" "}
                        {addAccountType === "email" ? "自动登录并添加" : "添加"}
                      </>
                    )}
                  </button>

                  {/* 超时后显示的取消登录按钮 */}
                  {showCancelLoginButton && addAccountType === "email" && (
                    <>
                      <button
                        type="button"
                        onClick={handleCancelAutoLogin}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        🛑 取消登录
                      </button>
                      <button
                        type="button"
                        onClick={handleShowAutoLoginWindow}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium leading-4 text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        👁️ 显示窗口
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewEmail("");
                      setNewToken("");
                      setNewPassword("");
                      setNewRefreshToken("");
                      setNewWorkosSessionToken("");
                      currentEmailRef.current = ""; // 也清空ref
                      setAddAccountType("token");
                      setShowLoginWindow(false);
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
                      <div className="flex items-center justify-between">
                        {/* 左侧：当前账户状态标识 */}
                        <div>
                          {account.is_current &&
                            accountData?.current_account &&
                            account.token ==
                              accountData?.current_account.token && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                                ✓ 当前账户
                              </span>
                            )}
                        </div>

                        {/* 右侧：操作按钮 */}
                        <div className="flex items-center space-x-2">
                          {/* 常用操作：切换和删除（仅非当前账户） */}
                          {!(
                            account.is_current &&
                            accountData?.current_account &&
                            account.token == accountData?.current_account.token
                          ) && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSwitchAccount(account.email)
                                }
                                className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 border border-transparent rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              >
                                🔄 切换
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveAccount(account.email)
                                }
                                className="inline-flex items-center px-3 py-1 text-xs font-medium text-red-700 bg-red-100 border border-transparent rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              >
                                🗑️ 删除
                              </button>
                            </>
                          )}

                          {/* 更多操作下拉菜单 */}
                          <div className="relative dropdown-menu">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenMenuEmail(
                                  openMenuEmail === account.email
                                    ? null
                                    : account.email
                                );
                              }}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-transparent rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                            >
                              ⚙️ 更多操作
                              <svg
                                className="w-3 h-3 ml-1"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>

                            {/* 下拉菜单内容 */}
                            {openMenuEmail === account.email && (
                              <div className="absolute right-0 z-50 w-48 mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                                <div className="py-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleEditAccount(account);
                                      setOpenMenuEmail(null);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    ✏️ 编辑账户
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleViewUsage(account);
                                      setOpenMenuEmail(null);
                                    }}
                                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    📊 查看用量
                                  </button>

                                  {account.workos_cursor_session_token && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleViewDashboard(account);
                                          setOpenMenuEmail(null);
                                        }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                      >
                                        🏠 查看主页
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleManualBindCard(account);
                                          setOpenMenuEmail(null);
                                        }}
                                        disabled={
                                          manualBindCardLoading ===
                                          account.email
                                        }
                                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {manualBindCardLoading === account.email
                                          ? "🔄 处理中..."
                                          : "💳 手动绑卡"}
                                      </button>

                                      <hr className="my-1" />

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleCancelSubscription(account);
                                          setOpenMenuEmail(null);
                                        }}
                                        disabled={
                                          cancelSubscriptionLoading ===
                                          account.email
                                        }
                                        className="flex items-center w-full px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {cancelSubscriptionLoading ===
                                        account.email
                                          ? "🔄 处理中..."
                                          : "📋 取消订阅"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleDeleteCursorAccount(account);
                                          setOpenMenuEmail(null);
                                        }}
                                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                                      >
                                        🚨 注销账户
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
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

      {/* 用量查看Modal */}
      {usageModalOpen && selectedAccountUsage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => {
              setUsageModalOpen(false);
              setSelectedPeriod("30days");
              setCustomStartDate("");
              setCustomEndDate("");
              setSelectedAccountUsage(null);
            }}
          ></div>
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                📊 账户用量详情 - {selectedAccountUsage.account.email}
              </h2>
              <button
                onClick={() => {
                  setUsageModalOpen(false);
                  setSelectedPeriod("30days");
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setSelectedAccountUsage(null);
                }}
                title="关闭"
                className="p-2 text-gray-400 rounded-lg hover:text-gray-600 hover:bg-gray-100"
              >
                <svg
                  className="w-5 h-5"
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
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* 时间段选择 */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-gray-700">
                  时间段选择
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => handlePeriodChange("7days")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      selectedPeriod === "7days"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    最近7天
                  </button>
                  <button
                    onClick={() => handlePeriodChange("30days")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      selectedPeriod === "30days"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    最近30天
                  </button>
                  <button
                    onClick={() => handlePeriodChange("thisMonth")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      selectedPeriod === "thisMonth"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    本月
                  </button>
                  <button
                    onClick={() => handlePeriodChange("custom")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      selectedPeriod === "custom"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    自定义
                  </button>
                </div>

                {/* 自定义日期选择 */}
                {selectedPeriod === "custom" && (
                  <div className="flex items-end gap-4 p-4 rounded-lg bg-gray-50">
                    <div className="flex-1">
                      <label className="block mb-1 text-sm font-medium text-gray-700">
                        开始日期
                      </label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        placeholder="选择开始日期"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block mb-1 text-sm font-medium text-gray-700">
                        结束日期
                      </label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        placeholder="选择结束日期"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleApplyCustomDate}
                      disabled={!customStartDate || !customEndDate}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-500 border border-transparent rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      应用
                    </button>
                  </div>
                )}
              </div>

              {/* 用量数据显示 */}
              {selectedAccountUsage.loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                  <span className="ml-3 text-gray-600">
                    正在加载用量数据...
                  </span>
                </div>
              ) : selectedAccountUsage.usageData ? (
                <AggregatedUsageDisplay
                  aggregatedUsage={selectedAccountUsage.usageData}
                  title={`用量统计 - ${
                    selectedPeriod === "7days"
                      ? "最近7天"
                      : selectedPeriod === "30days"
                      ? "最近30天"
                      : selectedPeriod === "thisMonth"
                      ? "本月"
                      : "自定义时间段"
                  }`}
                  variant="detailed"
                  token={selectedAccountUsage.account.token}
                  showDetailsButton={true}
                />
              ) : (
                <div className="py-12 text-center">
                  <div className="mb-2 text-lg text-gray-500">📭</div>
                  <p className="text-gray-600">暂无用量数据</p>
                  <p className="mt-1 text-sm text-gray-500">
                    可能是Token无效或者选择的时间段内没有使用记录
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setUsageModalOpen(false);
                  setSelectedPeriod("30days");
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setSelectedAccountUsage(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-transparent rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
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
