import React, { useState, useEffect } from "react";
import { Button } from "./Button";
import { Toast } from "./Toast";
import {
  BankCardConfig,
  BankCardConfigList,
  CHINA_PROVINCES,
  DEFAULT_BANK_CARD_CONFIG,
} from "../types/bankCardConfig";
import { BankCardConfigService } from "../services/bankCardConfigService";
import { confirm } from "@tauri-apps/plugin-dialog";

interface BankCardConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (config: BankCardConfig) => void;
}

export const BankCardConfigModal: React.FC<BankCardConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [configList, setConfigList] = useState<BankCardConfigList>({
    cards: [DEFAULT_BANK_CARD_CONFIG],
  });
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [config, setConfig] = useState<BankCardConfig>(
    DEFAULT_BANK_CARD_CONFIG
  );
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // 加载配置
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  // 当选择的卡片索引变化时，更新当前配置
  useEffect(() => {
    if (configList.cards[currentCardIndex]) {
      setConfig(configList.cards[currentCardIndex]);
    }
  }, [currentCardIndex, configList]);

  const loadConfig = async () => {
    try {
      const loadedConfigList =
        await BankCardConfigService.getBankCardConfigList();
      setConfigList(loadedConfigList);
      if (loadedConfigList.cards.length > 0) {
        setConfig(loadedConfigList.cards[0]);
        setCurrentCardIndex(0);
      }
    } catch (error) {
      console.error("加载银行卡配置失败:", error);
      setToast({ message: "加载配置失败", type: "error" });
    }
  };

  const handleInputChange = (field: keyof BankCardConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    // 同时更新configList中的当前卡片
    setConfigList((prev) => {
      const newCards = [...prev.cards];
      newCards[currentCardIndex] = {
        ...newCards[currentCardIndex],
        [field]: value,
      };
      return { cards: newCards };
    });
  };

  const handleAddCard = () => {
    // 使用第一张卡的账单地址信息，但银行卡信息使用默认值
    const firstCard = configList.cards[0];
    const newCard = {
      ...DEFAULT_BANK_CARD_CONFIG,
      // 复制第一张卡的账单地址信息
      billingCountry: firstCard.billingCountry,
      billingPostalCode: firstCard.billingPostalCode,
      billingAdministrativeArea: firstCard.billingAdministrativeArea,
      billingLocality: firstCard.billingLocality,
      billingDependentLocality: firstCard.billingDependentLocality,
      billingAddressLine1: firstCard.billingAddressLine1,
    };
    setConfigList((prev) => ({
      cards: [...prev.cards, newCard],
    }));
    setCurrentCardIndex(configList.cards.length);
    setConfig(newCard);
    setToast({
      message: "已添加新银行卡（已复制第一张卡的账单地址）",
      type: "info",
    });
  };

  const handleRemoveCard = async (index: number) => {
    if (configList.cards.length === 1) {
      setToast({ message: "至少需要保留一张银行卡", type: "error" });
      return;
    }

    try {
      const confirmed = await confirm(`确认删除第 ${index + 1} 张银行卡吗？`, {
        title: "删除银行卡",
        kind: "warning",
      });

      if (!confirmed) return;

      setConfigList((prev) => ({
        cards: prev.cards.filter((_, i) => i !== index),
      }));

      // 调整当前选中的卡片索引
      if (currentCardIndex >= index && currentCardIndex > 0) {
        setCurrentCardIndex(currentCardIndex - 1);
      }

      setToast({ message: "已删除银行卡", type: "success" });
    } catch (error) {
      console.error("删除银行卡失败:", error);
    }
  };

  const handleSave = async () => {
    // 验证当前配置
    const validation = BankCardConfigService.validateBankCardConfig(config);
    if (!validation.isValid) {
      setToast({
        message: `配置验证失败: ${validation.errors.join(", ")}`,
        type: "error",
      });
      return;
    }

    // 如果是非中国地址，显示确认弹窗
    if (config.billingCountry !== "China") {
      try {
        const confirmed = await confirm(
          "非中国地址注意事项：\n\n" +
            "• 系统将自动填写详细地址信息\n" +
            "• 填写完成后，浏览器会保持打开状态\n" +
            "• 您需要手动填写其他必要的地址信息（如邮编、州/省等）\n" +
            "• 填写完成后请手动提交表单\n\n" +
            "确认继续保存配置吗？",
          {
            title: "💳 银行卡配置 - 非中国地址",
            kind: "info",
          }
        );

        if (!confirmed) {
          return;
        }
      } catch (error) {
        console.error("弹窗确认失败:", error);
        setToast({ message: "弹窗确认失败，请重试", type: "error" });
        return;
      }
    }

    setIsLoading(true);
    try {
      const result = await BankCardConfigService.saveBankCardConfigList(
        configList
      );
      if (result.success) {
        setToast({ message: result.message, type: "success" });
        onSave?.(config);
        // 延迟关闭模态框，让用户看到成功消息
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (error) {
      setToast({ message: `保存失败: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardNumberChange = (value: string) => {
    // 只允许数字，并限制长度
    const numericValue = value.replace(/\D/g, "").slice(0, 19);
    handleInputChange("cardNumber", numericValue);
  };

  const handleExpiryChange = (value: string) => {
    // 格式化为 MM/YY
    let formatted = value.replace(/\D/g, "");
    if (formatted.length >= 2) {
      formatted = formatted.slice(0, 2) + "/" + formatted.slice(2, 4);
    }
    handleInputChange("cardExpiry", formatted);
  };

  const handleCvcChange = (value: string) => {
    // 只允许数字，限制3-4位
    const numericValue = value.replace(/\D/g, "").slice(0, 4);
    handleInputChange("cardCvc", numericValue);
  };

  const handlePostalCodeChange = (value: string) => {
    // 只允许数字，限制6位
    const numericValue = value.replace(/\D/g, "").slice(0, 6);
    handleInputChange("billingPostalCode", numericValue);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4 bg-white rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">💳 银行卡配置</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="关闭"
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
        </div>

        {/* 卡片选择器 */}
        <div className="p-4 mb-6 rounded-md bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              银行卡列表 ({configList.cards.length} 张)
            </label>
            <Button
              onClick={handleAddCard}
              variant="secondary"
              className="px-2 py-1 text-xs"
            >
              ➕ 添加银行卡
            </Button>
          </div>
          <div className="flex gap-2 py-2 overflow-x-auto">
            {configList.cards.map((card, index) => (
              <div
                key={index}
                className={`relative flex-shrink-0 p-3 border-2 rounded-md cursor-pointer transition-all ${
                  currentCardIndex === index
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 bg-white hover:border-gray-400"
                }`}
                onClick={() => setCurrentCardIndex(index)}
              >
                <div className="text-sm font-medium">卡片 {index + 1}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {card.cardNumber.slice(-4) || "未设置"}
                </div>
                {configList.cards.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCard(index);
                    }}
                    className="absolute text-red-500 top-1 right-1 hover:text-red-700"
                    title="删除"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* 银行卡基本信息 */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="cardNumber"
                className="block text-sm font-medium text-gray-700"
              >
                银行卡号 *
              </label>
              <input
                type="text"
                id="cardNumber"
                value={config.cardNumber}
                onChange={(e) => handleCardNumberChange(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === "--") {
                    handleInputChange("cardNumber", "");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "") {
                    handleInputChange("cardNumber", "--");
                  }
                }}
                className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="请输入银行卡号"
                maxLength={19}
              />
            </div>

            <div>
              <label
                htmlFor="cardExpiry"
                className="block text-sm font-medium text-gray-700"
              >
                有效期 *
              </label>
              <input
                type="text"
                id="cardExpiry"
                value={config.cardExpiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === "--") {
                    handleInputChange("cardExpiry", "");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "") {
                    handleInputChange("cardExpiry", "--");
                  }
                }}
                className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="MM/YY"
                maxLength={5}
              />
            </div>

            <div>
              <label
                htmlFor="cardCvc"
                className="block text-sm font-medium text-gray-700"
              >
                CVC码 *
              </label>
              <input
                type="text"
                id="cardCvc"
                value={config.cardCvc}
                onChange={(e) => handleCvcChange(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === "--") {
                    handleInputChange("cardCvc", "");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "") {
                    handleInputChange("cardCvc", "--");
                  }
                }}
                className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="请输入CVC码"
                maxLength={4}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="billingName"
                className="block text-sm font-medium text-gray-700"
              >
                持卡人姓名 *
              </label>
              <input
                type="text"
                id="billingName"
                value={config.billingName}
                onChange={(e) =>
                  handleInputChange("billingName", e.target.value)
                }
                onFocus={(e) => {
                  if (e.target.value === "--") {
                    handleInputChange("billingName", "");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "") {
                    handleInputChange("billingName", "--");
                  }
                }}
                className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="请输入持卡人姓名"
              />
            </div>
          </div>

          {/* 账单地址信息 */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="mb-4 font-medium text-gray-900 text-md">
              📍 账单地址信息
            </h4>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="billingCountry"
                  className="block text-sm font-medium text-gray-700"
                >
                  国家/地区
                </label>
                <select
                  id="billingCountry"
                  value={config.billingCountry}
                  onChange={(e) =>
                    handleInputChange("billingCountry", e.target.value)
                  }
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="China">中国地址（需要直连网络）</option>
                  <option value="Japan">
                    其他地址（除中国任意地区需要手动填写地址信息，到最终绑卡页面会自动填写卡片信息，填完不会关闭浏览器）
                  </option>
                </select>
              </div>

              {/* 只有选择中国时才显示以下字段 */}
              {config.billingCountry === "China" && (
                <>
                  <div>
                    <label
                      htmlFor="billingPostalCode"
                      className="block text-sm font-medium text-gray-700"
                    >
                      邮政编码 *
                    </label>
                    <input
                      type="text"
                      id="billingPostalCode"
                      value={config.billingPostalCode}
                      onChange={(e) => handlePostalCodeChange(e.target.value)}
                      onFocus={(e) => {
                        if (e.target.value === "--") {
                          handleInputChange("billingPostalCode", "");
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          handleInputChange("billingPostalCode", "--");
                        }
                      }}
                      className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="请输入邮政编码"
                      maxLength={6}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="billingAdministrativeArea"
                      className="block text-sm font-medium text-gray-700"
                    >
                      省份/行政区 *
                    </label>
                    <select
                      id="billingAdministrativeArea"
                      value={config.billingAdministrativeArea}
                      onChange={(e) =>
                        handleInputChange(
                          "billingAdministrativeArea",
                          e.target.value
                        )
                      }
                      className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">请选择省份</option>
                      {CHINA_PROVINCES.map((province) => (
                        <option key={province.value} value={province.value}>
                          {province.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="billingLocality"
                      className="block text-sm font-medium text-gray-700"
                    >
                      城市 *
                    </label>
                    <input
                      type="text"
                      id="billingLocality"
                      value={config.billingLocality}
                      onChange={(e) =>
                        handleInputChange("billingLocality", e.target.value)
                      }
                      onFocus={(e) => {
                        if (e.target.value === "--") {
                          handleInputChange("billingLocality", "");
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          handleInputChange("billingLocality", "--");
                        }
                      }}
                      className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="请输入城市"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="billingDependentLocality"
                      className="block text-sm font-medium text-gray-700"
                    >
                      区县 *
                    </label>
                    <input
                      type="text"
                      id="billingDependentLocality"
                      value={config.billingDependentLocality}
                      onChange={(e) =>
                        handleInputChange(
                          "billingDependentLocality",
                          e.target.value
                        )
                      }
                      onFocus={(e) => {
                        if (e.target.value === "--") {
                          handleInputChange("billingDependentLocality", "");
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          handleInputChange("billingDependentLocality", "--");
                        }
                      }}
                      className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="请输入区县"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label
                  htmlFor="billingAddressLine1"
                  className="block text-sm font-medium text-gray-700"
                >
                  详细地址 *
                  {config.billingCountry === "Japan" && (
                    <span className="text-xs text-gray-500">
                      アオモリケン, カミキタグンシチノヘマチ, サイノカミ,
                      412-1043
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  id="billingAddressLine1"
                  value={config.billingAddressLine1}
                  onChange={(e) =>
                    handleInputChange("billingAddressLine1", e.target.value)
                  }
                  onFocus={(e) => {
                    if (e.target.value === "--") {
                      handleInputChange("billingAddressLine1", "");
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "") {
                      handleInputChange("billingAddressLine1", "--");
                    }
                  }}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="请输入详细地址"
                />
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end pt-6 space-x-3 border-t border-gray-200">
            <Button onClick={onClose} variant="secondary" disabled={isLoading}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white rounded-full border-t-transparent animate-spin" />
                  保存中...
                </>
              ) : (
                "💾 保存配置"
              )}
            </Button>
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
      </div>
    </div>
  );
};
