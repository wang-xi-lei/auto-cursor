import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../components/Button";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Toast } from "../components/Toast";
import { BankCardConfigModal } from "../components/BankCardConfigModal";
import { EmailConfigModal } from "../components/EmailConfigModal";
import { AccountService } from "../services/accountService";
import { BankCardConfigService } from "../services/bankCardConfigService";
import { EmailConfigService } from "../services/emailConfigService";
import { BankCardConfig } from "../types/bankCardConfig";
import { EmailConfig } from "../types/emailConfig";
import { base64URLEncode, K, sha256 } from "../utils/cursorToken";
import { confirm } from "@tauri-apps/plugin-dialog";

interface RegistrationForm {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

interface RegistrationResult {
  success: boolean | string;
  message: string;
  details?: string[];
  action?: string;
  status?: string;
  output_lines?: string[];
  raw_output?: string;
  error_output?: string;
  accountInfo?: {
    email: string;
    token: string;
    usage: string;
  };
}

export const AutoRegisterPage: React.FC = () => {
  const [form, setForm] = useState<RegistrationForm>({
    email: "",
    firstName: "",
    lastName: "",
    password: "",
  });
  const [emailType, setEmailType] = useState<
    "custom" | "cloudflare_temp" | "outlook"
  >("custom");
  const [outlookMode, setOutlookMode] = useState<"default" | "token">(
    "default"
  );
  const [outlookEmail, setOutlookEmail] = useState("");
  const [useIncognito, setUseIncognito] = useState(true);
  const [enableBankCardBinding, setEnableBankCardBinding] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [registrationResult, setRegistrationResult] =
    useState<RegistrationResult | null>(null);
  const [useRandomInfo, setUseRandomInfo] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [realtimeOutput, setRealtimeOutput] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const isRegisteringRef = useRef(false);
  const realtimeOutputRef = useRef<string[]>([]);
  const [showBankCardConfig, setShowBankCardConfig] = useState(false);
  const [bankCardConfig, setBankCardConfig] = useState<BankCardConfig | null>(
    null
  );
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);

  // 同步ref和state
  useEffect(() => {
    isRegisteringRef.current = isRegistering;
  }, [isRegistering]);

  // 根据webToken获取客户端assToken
  const getClientAccessToken = (workos_cursor_session_token: string) => {
    return new Promise(async (resolve, _reject) => {
      let verifier = base64URLEncode(K);
      let challenge = base64URLEncode(new Uint8Array(await sha256(verifier)));
      let uuid = crypto.randomUUID();
      // 轮询查token
      let interval = setInterval(() => {
        invoke("trigger_authorization_login_poll", {
          uuid,
          verifier,
        }).then((res: any) => {
          console.log(res, "res");
          if (res.success) {
            const data = JSON.parse(res.response_body);
            console.log(data, "data");
            resolve(data);
            setToast({ message: "token获取成功", type: "success" });
            clearInterval(interval);
          }
        });
      }, 1000);

      // 60秒后清除定时器
      setTimeout(() => {
        clearInterval(interval);
        resolve(null);
      }, 1000 * 20);

      // 触发授权登录-rust
      invoke("trigger_authorization_login", {
        uuid,
        challenge,
        workosCursorSessionToken: workos_cursor_session_token,
      });
    });
  };

  // 监听实时输出事件
  useEffect(() => {
    console.log("设置事件监听器...");
    const setupListeners = async () => {
      // 监听注册输出
      const unlistenOutput = await listen(
        "registration-output",
        async (event: any) => {
          console.log("收到实时输出事件:", event.payload);
          const data = event.payload;
          if (
            data.line.includes("workos_cursor_session_token") &&
            data.line.includes("token") &&
            data.line.includes("user_")
          ) {
            const resObj: any = JSON.parse(data.line);
            getClientAccessToken(resObj.workos_cursor_session_token).then(
              async (res: any) => {
                try {
                  const result = await AccountService.addAccount(
                    resObj.email,
                    res.accessToken,
                    res.refreshToken,
                    resObj.workos_cursor_session_token || undefined
                  );
                  if (result.success) {
                    setToast({ message: "账户添加成功", type: "success" });
                  } else {
                    setToast({ message: result.message, type: "error" });
                  }
                } catch (error) {
                  console.error("Failed to add account:", error);
                  setToast({ message: "添加账户失败", type: "error" });
                }
                console.log(res.accessToken, "res.accessToken");
              }
            );
          }

          if (data.line.includes("程序将保持运行状态")) {
            // 提示用户手动输入绑卡地址，完成后关闭浏览器会自动保存账号
            try {
              const confirmed = await confirm(
                "程序将保持运行状态，请手动输入绑卡地址，完成后关闭浏览器会自动保存账号",
                {
                  title: "程序将保持运行状态",
                  kind: "info",
                }
              );
              if (confirmed) {
                setToast({ message: "已确认", type: "success" });
              } else {
                setToast({ message: "未确认", type: "error" });
              }
            } catch (error) {
              console.error("弹窗确认失败:", error);
              setToast({ message: "弹窗确认失败，请重试", type: "error" });
              return;
            }
          }

          // 同时更新ref和state
          realtimeOutputRef.current = [...realtimeOutputRef.current, data.line];
          setRealtimeOutput((prev) => [...prev, data.line]);
          console.log("更新输出，当前行数:", realtimeOutputRef.current.length);

          console.log("触发状态更新");
        }
      );

      // 监听验证码请求
      const unlistenVerification = await listen(
        "verification-code-required",
        () => {
          // 只有在正在注册时才显示验证码弹窗
          if (isRegisteringRef.current) {
            setShowVerificationModal(true);
            setToast({ message: "请输入验证码", type: "info" });
          }
        }
      );

      // 监听自动获取的验证码
      const unlistenAutoCode = await listen(
        "verification-code-auto-filled",
        (event: any) => {
          const code = event.payload;
          console.log("🎯 收到自动获取的验证码:", code);
          setVerificationCode(code);
          setToast({ message: `自动获取验证码成功: ${code}`, type: "success" });
        }
      );

      // 监听验证码获取失败
      const unlistenCodeFailed = await listen(
        "verification-code-failed",
        (event: any) => {
          const error = event.payload;
          console.log("❌ 自动获取验证码失败:", error);
          setToast({ message: `自动获取验证码失败: ${error}`, type: "error" });
        }
      );

      // 监听需要手动输入验证码
      const unlistenManualInput = await listen(
        "verification-code-manual-input-required",
        (event: any) => {
          const message = event.payload;
          console.log("🔍 需要手动输入验证码:", message);
          setShowVerificationModal(true);
          setToast({
            message: "自动获取验证码失败，请手动输入验证码",
            type: "info",
          });
        }
      );

      console.log("事件监听器设置完成");

      return () => {
        unlistenOutput();
        unlistenVerification();
        unlistenAutoCode();
        unlistenCodeFailed();
        unlistenManualInput();
      };
    };

    let cleanup: (() => void) | undefined;

    setupListeners().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      console.log("清理事件监听器");
      if (cleanup) {
        cleanup();
      }
    };
  }, []); // 确保只运行一次

  const generateRandomInfo = () => {
    const firstNames = [
      "Alex",
      "Jordan",
      "Taylor",
      "Casey",
      "Morgan",
      "Riley",
      "Avery",
      "Quinn",
    ];
    const lastNames = [
      "Smith",
      "Johnson",
      "Williams",
      "Brown",
      "Jones",
      "Garcia",
      "Miller",
      "Davis",
    ];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    // Generate random password
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    setForm((prev) => ({
      ...prev, // 保留邮箱地址不变
      firstName,
      lastName,
      password,
    }));
  };

  const handleInputChange = (field: keyof RegistrationForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleVerificationCodeSubmit = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setToast({ message: "请输入6位验证码", type: "error" });
      return;
    }

    try {
      await invoke("submit_verification_code", { code: verificationCode });
      setShowVerificationModal(false);
      setVerificationCode("");
      setToast({ message: "验证码已提交", type: "success" });
    } catch (error) {
      setToast({ message: `提交验证码失败: ${error}`, type: "error" });
    }
  };

  const handleCancelRegistration = async () => {
    try {
      await invoke("cancel_registration");
      setShowVerificationModal(false);
      setVerificationCode("");
      setIsRegistering(false);
      setToast({ message: "注册已取消", type: "info" });
    } catch (error) {
      setToast({ message: `取消注册失败: ${error}`, type: "error" });
    }
  };

  const validateForm = (): boolean => {
    // 自定义邮箱需要验证邮箱地址
    if (emailType === "custom" && (!form.email || !form.email.includes("@"))) {
      setToast({ message: "请输入有效的邮箱地址", type: "error" });
      return false;
    }
    // Outlook邮箱需要验证邮箱地址
    if (emailType === "outlook" && outlookMode === "default") {
      if (!outlookEmail || !outlookEmail.includes("@")) {
        setToast({ message: "请输入有效的Outlook邮箱地址", type: "error" });
        return false;
      }
      if (!outlookEmail.toLowerCase().includes("outlook.com")) {
        setToast({ message: "请输入@outlook.com邮箱地址", type: "error" });
        return false;
      }
    }
    if (!form.firstName.trim()) {
      setToast({ message: "请输入名字", type: "error" });
      return false;
    }
    if (!form.lastName.trim()) {
      setToast({ message: "请输入姓氏", type: "error" });
      return false;
    }
    if (!form.password || form.password.length < 8) {
      setToast({ message: "密码长度至少8位", type: "error" });
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setIsRegistering(true);
    setRegistrationResult(null);
    realtimeOutputRef.current = []; // 清空ref
    setRealtimeOutput([]); // 清空之前的输出
    setToast({ message: "开始注册 Cursor 账户...", type: "info" });

    try {
      let result: RegistrationResult;

      if (emailType === "cloudflare_temp") {
        // 使用Cloudflare临时邮箱注册
        result = await invoke<RegistrationResult>(
          "register_with_cloudflare_temp_email",
          {
            firstName: form.firstName,
            lastName: form.lastName,
            useIncognito: useIncognito,
            enableBankCardBinding: enableBankCardBinding,
          }
        );
      } else if (emailType === "outlook" && outlookMode === "default") {
        // 使用Outlook邮箱注册
        result = await invoke<RegistrationResult>("register_with_outlook", {
          email: outlookEmail,
          firstName: form.firstName,
          lastName: form.lastName,
          useIncognito: useIncognito,
          enableBankCardBinding: enableBankCardBinding,
        });
      } else {
        // 使用自定义邮箱注册
        result = await invoke<RegistrationResult>("register_with_email", {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          useIncognito: useIncognito,
          enableBankCardBinding: enableBankCardBinding,
        });
      }

      setRegistrationResult(result);

      // 调试：打印收到的结果
      console.log("注册结果:", result);
      console.log("输出行数:", result.output_lines?.length || 0);

      // 检查输出中是否包含验证码请求
      const needsVerificationCode = result.message.includes("请输入验证码");

      if (needsVerificationCode && emailType === "custom") {
        // 只有自定义邮箱才需要手动输入验证码
        setShowVerificationModal(true);
        setToast({ message: "请输入验证码", type: "info" });
      } else if (needsVerificationCode && emailType === "outlook") {
        // Outlook邮箱会自动获取验证码
        setToast({ message: "正在从Outlook邮箱获取验证码...", type: "info" });
      } else if (
        result.success == "completed" ||
        result.message == "注册成功"
      ) {
        // 注册成功，确保关闭验证码弹窗
        setShowVerificationModal(false);
        setToast({ message: "注册成功！", type: "success" });
      } else {
        // 注册失败，也关闭验证码弹窗
        setShowVerificationModal(false);
        setToast({ message: result.message || "注册失败", type: "error" });
      }
    } catch (error) {
      console.error("Registration error:", error);
      setToast({
        message: `注册失败: ${error}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
      setIsRegistering(false);
    }
  };

  const handleGenerateRandom = () => {
    generateRandomInfo();
    setToast({ message: "已生成随机账户信息", type: "info" });
  };

  // 加载银行卡配置
  const loadBankCardConfig = async () => {
    try {
      const config = await BankCardConfigService.getBankCardConfig();
      setBankCardConfig(config);
    } catch (error) {
      console.error("加载银行卡配置失败:", error);
    }
  };

  const handleBankCardConfigSave = (config: BankCardConfig) => {
    setBankCardConfig(config);
    setToast({ message: "银行卡配置已更新", type: "success" });
  };

  // 加载邮箱配置
  const loadEmailConfig = async () => {
    try {
      const config = await EmailConfigService.getEmailConfig();
      setEmailConfig(config);
    } catch (error) {
      console.error("加载邮箱配置失败:", error);
    }
  };

  const handleEmailConfigSave = (config: EmailConfig) => {
    setEmailConfig(config);
    setToast({ message: "邮箱配置已更新", type: "success" });
  };

  // Initialize with random info on component mount
  React.useEffect(() => {
    if (useRandomInfo) {
      generateRandomInfo();
    }
    // 加载银行卡配置和邮箱配置
    loadBankCardConfig();
    loadEmailConfig();
  }, [useRandomInfo]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              📝 Cursor 自动注册
            </h3>
            <Button
              onClick={() => setShowBankCardConfig(true)}
              variant="secondary"
              className="flex items-center"
            >
              💳 银行卡配置
            </Button>
          </div>

          <div className="space-y-6">
            {/* 使用随机信息选项 */}
            <div className="flex items-center">
              <input
                id="use-random"
                type="checkbox"
                checked={useRandomInfo}
                onChange={(e) => setUseRandomInfo(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor="use-random"
                className="block ml-2 text-sm text-gray-900"
              >
                使用随机生成的账户信息
              </label>
            </div>

            {/* 表单 */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-700"
                >
                  名字
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) =>
                    handleInputChange("firstName", e.target.value)
                  }
                  disabled={useRandomInfo}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  placeholder="请输入名字"
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700"
                >
                  姓氏
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) =>
                    handleInputChange("lastName", e.target.value)
                  }
                  disabled={useRandomInfo}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  placeholder="请输入姓氏"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block mb-3 text-sm font-medium text-gray-700">
                  邮箱类型
                </label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      id="email-custom"
                      name="email-type"
                      type="radio"
                      value="custom"
                      checked={emailType === "custom"}
                      onChange={(e) =>
                        setEmailType(
                          e.target.value as
                            | "custom"
                            | "cloudflare_temp"
                            | "outlook"
                        )
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="email-custom"
                      className="ml-2 text-sm text-gray-700"
                    >
                      自定义邮箱（手动输入验证码）
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="email-cloudflare"
                      name="email-type"
                      type="radio"
                      value="cloudflare_temp"
                      checked={emailType === "cloudflare_temp"}
                      onChange={(e) =>
                        setEmailType(
                          e.target.value as
                            | "custom"
                            | "cloudflare_temp"
                            | "outlook"
                        )
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="email-cloudflare"
                      className="ml-2 text-sm text-gray-700"
                    >
                      Cloudflare临时邮箱（自动获取验证码）
                    </label>
                  </div>
                  {/* <div className="flex items-center">
                    <input
                      id="email-outlook"
                      name="email-type"
                      type="radio"
                      value="outlook"
                      checked={emailType === "outlook"}
                      onChange={(e) =>
                        setEmailType(
                          e.target.value as
                            | "custom"
                            | "cloudflare_temp"
                            | "outlook"
                        )
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="email-outlook"
                      className="ml-2 text-sm text-gray-700"
                    >
                      Outlook邮箱（自动获取验证码）
                    </label>
                  </div> */}
                </div>
              </div>

              {emailType === "custom" && (
                <div className="sm:col-span-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={form.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="请输入邮箱地址"
                  />
                </div>
              )}

              {emailType === "cloudflare_temp" && (
                <div className="sm:col-span-2">
                  <div className="p-3 border border-blue-200 rounded-md bg-blue-50">
                    <p className="text-sm text-blue-700">
                      📧 将自动创建临时邮箱并获取验证码，无需手动输入
                    </p>
                  </div>
                </div>
              )}

              {emailType === "outlook" && (
                <div className="space-y-4 sm:col-span-2">
                  {/* Outlook模式选择 */}
                  <div>
                    <label className="block mb-3 text-sm font-medium text-gray-700">
                      Outlook模式
                    </label>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <input
                          id="outlook-default"
                          name="outlook-mode"
                          type="radio"
                          value="default"
                          checked={outlookMode === "default"}
                          onChange={(e) =>
                            setOutlookMode(
                              e.target.value as "default" | "token"
                            )
                          }
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <label
                          htmlFor="outlook-default"
                          className="ml-2 text-sm text-gray-700"
                        >
                          默认模式（只需输入邮箱）
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          id="outlook-token"
                          name="outlook-mode"
                          type="radio"
                          value="token"
                          checked={outlookMode === "token"}
                          onChange={(e) =>
                            setOutlookMode(
                              e.target.value as "default" | "token"
                            )
                          }
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          disabled
                        />
                        <label
                          htmlFor="outlook-token"
                          className="ml-2 text-sm text-gray-400"
                        >
                          令牌模式（TODO: 待实现）
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 默认模式配置 */}
                  {outlookMode === "default" && (
                    <div>
                      <label
                        htmlFor="outlook-email"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Outlook邮箱地址
                      </label>
                      <input
                        type="email"
                        id="outlook-email"
                        value={outlookEmail}
                        onChange={(e) => setOutlookEmail(e.target.value)}
                        placeholder="example@outlook.com"
                        className="block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        请输入你的@outlook.com邮箱地址
                      </p>
                      <div className="p-3 mt-3 border border-green-200 rounded-md bg-green-50">
                        <p className="text-sm text-green-700">
                          📧 将自动获取该邮箱的验证码，无需手动输入
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 令牌模式配置（预留） */}
                  {outlookMode === "token" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        令牌配置（格式：邮箱----密码----ID----令牌）
                      </label>
                      <textarea
                        rows={3}
                        placeholder="TODO: 令牌模式待实现"
                        className="block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        disabled
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="sm:col-span-2">
                <div className="flex items-center">
                  <input
                    id="use-incognito"
                    type="checkbox"
                    checked={useIncognito}
                    onChange={(e) => setUseIncognito(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor="use-incognito"
                    className="ml-2 text-sm text-gray-700"
                  >
                    使用无痕模式（推荐）
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  无痕模式可以避免浏览器缓存和历史记录影响注册过程
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center">
                  <input
                    id="enable-bank-card-binding"
                    type="checkbox"
                    checked={enableBankCardBinding}
                    onChange={(e) => setEnableBankCardBinding(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor="enable-bank-card-binding"
                    className="ml-2 text-sm text-gray-700"
                  >
                    自动绑定银行卡（默认）
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  勾选后将自动执行银行卡绑定流程，取消勾选则跳过银行卡绑定
                </p>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  密码
                </label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={form.password}
                    onChange={(e) =>
                      handleInputChange("password", e.target.value)
                    }
                    disabled={useRandomInfo}
                    className="block w-full pr-10 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                    placeholder="请输入密码（至少8位）"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 邮箱配置状态 */}
            {emailConfig && (
              <div className="p-4 border border-green-200 rounded-md bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-medium text-green-800">
                      📧 邮箱配置状态
                    </h5>
                    <p className="mt-1 text-sm text-green-700">
                      Worker域名: {emailConfig.worker_domain || "未配置"} |
                      邮箱域名: {emailConfig.email_domain || "未配置"} | 密码:{" "}
                      {emailConfig.admin_password ? "已配置" : "未配置"}
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowEmailConfig(true)}
                    variant="secondary"
                    size="sm"
                  >
                    编辑
                  </Button>
                </div>
              </div>
            )}

            {/* 银行卡配置状态 */}
            {bankCardConfig && (
              <div className="p-4 border border-blue-200 rounded-md bg-blue-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-medium text-blue-800">
                      💳 银行卡配置状态
                    </h5>
                    <p className="mt-1 text-sm text-blue-700">
                      卡号:{" "}
                      {bankCardConfig.cardNumber
                        ? `${bankCardConfig.cardNumber.slice(
                            0,
                            4
                          )}****${bankCardConfig.cardNumber.slice(-4)}`
                        : "未配置"}{" "}
                      | 持卡人: {bankCardConfig.billingName || "未配置"} | 地址:{" "}
                      {bankCardConfig.billingAdministrativeArea || "未配置"}
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowBankCardConfig(true)}
                    variant="secondary"
                    size="sm"
                  >
                    编辑
                  </Button>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex space-x-4">
              {useRandomInfo && (
                <Button
                  onClick={handleGenerateRandom}
                  variant="secondary"
                  disabled={isLoading}
                >
                  🎲 重新生成随机信息
                </Button>
              )}

              <Button
                onClick={handleRegister}
                disabled={isLoading}
                className="flex items-center"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    注册中...
                  </>
                ) : (
                  "🚀 开始注册"
                )}
              </Button>
            </div>

            {/* 注册结果 */}
            {registrationResult && (
              <div
                className={`p-4 rounded-md ${
                  registrationResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <h4
                  className={`text-sm font-medium ${
                    registrationResult.success
                      ? "text-green-800"
                      : "text-red-800"
                  }`}
                >
                  {registrationResult.success ? "✅ 注册成功" : "❌ 注册失败"}
                </h4>
                <p
                  className={`mt-1 text-sm ${
                    registrationResult.success
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {registrationResult.message}
                </p>
                {registrationResult.accountInfo && (
                  <div className="p-3 mt-3 bg-white border rounded">
                    <h5 className="mb-2 text-sm font-medium text-gray-900">
                      账户信息：
                    </h5>
                    <div className="space-y-1 text-sm text-gray-700">
                      <div>
                        <strong>邮箱：</strong>{" "}
                        {registrationResult.accountInfo.email}
                      </div>
                      <div>
                        <strong>Token：</strong>{" "}
                        <span className="font-mono text-xs break-all">
                          {registrationResult.accountInfo.token}
                        </span>
                      </div>
                      <div>
                        <strong>使用限制：</strong>{" "}
                        {registrationResult.accountInfo.usage}
                      </div>
                    </div>
                  </div>
                )}
                {registrationResult.details &&
                  registrationResult.details.length > 0 && (
                    <div className="mt-3">
                      <h5 className="mb-1 text-sm font-medium text-gray-900">
                        详细信息：
                      </h5>
                      <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside">
                        {registrationResult.details.map((detail, index) => (
                          <li key={index}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
            {/* 显示实时Python脚本输出 */}
            {(isRegistering || realtimeOutput.length > 0) && (
              <div className="mt-3">
                <h5 className="mb-2 text-sm font-medium text-gray-900">
                  脚本执行日志：
                  {isRegistering && (
                    <span className="ml-2 text-xs text-blue-600">
                      (实时更新中...)
                    </span>
                  )}
                </h5>
                <div className="p-3 overflow-y-auto bg-gray-900 rounded-md max-h-64">
                  <div className="space-y-1 font-mono text-xs text-green-400">
                    {Array.from(new Set(realtimeOutput)).map((line, index) => (
                      <div key={index} className="whitespace-pre-wrap">
                        {line}
                      </div>
                    ))}
                    {isRegistering && realtimeOutput.length === 0 && (
                      <div className="text-yellow-400">等待脚本输出...</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* 显示错误输出 */}
            {/* {registrationResult.error_output && (
                  <div className="mt-3">
                    <h5 className="mb-2 text-sm font-medium text-red-700">
                      错误信息：
                    </h5>
                    <div className="p-3 overflow-y-auto border border-red-200 rounded-md bg-red-50 max-h-32">
                      <pre className="text-xs text-red-700 whitespace-pre-wrap">
                        {registrationResult.error_output}
                      </pre>
                    </div>
                  </div>
                )} */}
          </div>
        </div>
      </div>

      {/* Toast 通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* 验证码输入弹窗 */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-w-md p-6 mx-4 bg-white rounded-lg w-96">
            <h3 className="mb-4 text-lg font-medium text-gray-900">
              输入验证码
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              请检查您的邮箱并输入6位验证码
            </p>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setVerificationCode(value);
              }}
              placeholder="请输入6位验证码"
              className="w-full px-3 py-2 text-lg tracking-widest text-center border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={6}
              autoFocus
            />
            <div className="flex justify-end mt-6 space-x-3">
              <button
                type="button"
                onClick={handleCancelRegistration}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                取消注册
              </button>
              <button
                type="button"
                onClick={handleVerificationCodeSubmit}
                disabled={verificationCode.length !== 6}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                提交
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 邮箱配置模态框 */}
      <EmailConfigModal
        isOpen={showEmailConfig}
        onClose={() => setShowEmailConfig(false)}
        onSave={handleEmailConfigSave}
      />

      {/* 银行卡配置模态框 */}
      <BankCardConfigModal
        isOpen={showBankCardConfig}
        onClose={() => setShowBankCardConfig(false)}
        onSave={handleBankCardConfigSave}
      />
    </div>
  );
};
