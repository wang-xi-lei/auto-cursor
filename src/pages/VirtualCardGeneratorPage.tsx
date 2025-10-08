import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../components/Button";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Toast } from "../components/Toast";
import { BankCardConfigService } from "../services/bankCardConfigService";
import { BankCardConfig, CHINA_PROVINCES } from "../types/bankCardConfig";

interface GeneratedCard {
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  cardType: string;
  isValid: boolean;
  cdkId: number;
  isActive: boolean;
  id: number;
  createdAt: string;
  updatedAt: string;
}

interface GenerateResponse {
  cards: GeneratedCard[];
  generatedCount: number;
  cdkRemainingCards: number;
}

interface AddressForm {
  billingName: string;
  billingCountry: string;
  billingPostalCode: string;
  billingAdministrativeArea: string;
  billingLocality: string;
  billingDependentLocality: string;
  billingAddressLine1: string;
}

export const VirtualCardGeneratorPage: React.FC = () => {
  const [cdkCode, setCdkCode] = useState("");
  const [customPrefix, setCustomPrefix] = useState("559888039");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(
    null
  );
  const [remainingCards, setRemainingCards] = useState<number | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>({
    billingName: "",
    billingCountry: "China",
    billingPostalCode: "",
    billingAdministrativeArea: "",
    billingLocality: "",
    billingDependentLocality: "",
    billingAddressLine1: "",
  });

  const handleGenerate = async () => {
    if (!cdkCode.trim()) {
      setToast({ message: "请输入CDK码", type: "error" });
      return;
    }

    if (!customPrefix.trim()) {
      setToast({ message: "请输入卡头", type: "error" });
      return;
    }

    setIsLoading(true);
    setGeneratedCard(null);

    try {
      // 使用 Tauri invoke 调用后端 Rust 命令
      const data = await invoke<GenerateResponse>("generate_virtual_card", {
        cdkCode: cdkCode.trim(),
        customPrefix: customPrefix.trim(),
      });

      if (data.cards && data.cards.length > 0) {
        setGeneratedCard(data.cards[0]);
        setRemainingCards(data.cdkRemainingCards);
        setToast({
          message: `成功生成虚拟卡！剩余可用数量: ${data.cdkRemainingCards}`,
          type: "success",
        });
      } else {
        throw new Error("生成失败，未返回卡片信息");
      }
    } catch (error: any) {
      console.error("生成虚拟卡失败:", error);
      setToast({
        message: `生成失败: ${(JSON.parse(error) as any)?.message}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToConfig = async () => {
    if (!generatedCard) return;

    // 先检查是否已有银行卡配置
    try {
      const existingConfig =
        await BankCardConfigService.getBankCardConfigList();

      if (
        existingConfig.cards.length === 0 ||
        !existingConfig.cards[0].billingAddressLine1 ||
        existingConfig.cards[0].billingAddressLine1 === "--"
      ) {
        // 没有有效的地址信息，需要用户输入
        setShowAddressForm(true);
        return;
      }

      // 有现有地址，直接使用第一张卡的地址信息
      await addCardWithAddress(existingConfig.cards[0]);
    } catch (error) {
      console.error("读取银行卡配置失败:", error);
      setShowAddressForm(true);
    }
  };

  const addCardWithAddress = async (
    addressInfo: BankCardConfig | AddressForm
  ) => {
    if (!generatedCard) return;

    try {
      // 读取现有配置
      const existingConfig =
        await BankCardConfigService.getBankCardConfigList();

      // 创建新卡配置
      const newCard: BankCardConfig = {
        cardNumber: generatedCard.cardNumber,
        cardExpiry: generatedCard.cardExpiry,
        cardCvc: generatedCard.cardCvc,
        billingName: addressInfo.billingName,
        billingCountry: addressInfo.billingCountry,
        billingPostalCode: addressInfo.billingPostalCode,
        billingAdministrativeArea: addressInfo.billingAdministrativeArea,
        billingLocality: addressInfo.billingLocality,
        billingDependentLocality: addressInfo.billingDependentLocality,
        billingAddressLine1: addressInfo.billingAddressLine1,
      };

      // 将新卡添加到最前面
      const updatedConfig = {
        cards: [newCard, ...existingConfig.cards],
      };

      const result = await BankCardConfigService.saveBankCardConfigList(
        updatedConfig
      );

      if (result.success) {
        setToast({
          message: "虚拟卡已添加到配置！",
          type: "success",
        });
        setGeneratedCard(null);
        setShowAddressForm(false);
      } else {
        setToast({
          message: result.message,
          type: "error",
        });
      }
    } catch (error) {
      console.error("添加到配置失败:", error);
      setToast({
        message: `添加失败: ${error}`,
        type: "error",
      });
    }
  };

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证地址表单
    if (!addressForm.billingName.trim()) {
      setToast({ message: "请输入持卡人姓名", type: "error" });
      return;
    }

    if (addressForm.billingCountry === "China") {
      if (!addressForm.billingPostalCode.trim()) {
        setToast({ message: "请输入邮政编码", type: "error" });
        return;
      }
      if (!addressForm.billingLocality.trim()) {
        setToast({ message: "请输入城市", type: "error" });
        return;
      }
      if (!addressForm.billingDependentLocality.trim()) {
        setToast({ message: "请输入区县", type: "error" });
        return;
      }
    }

    if (!addressForm.billingAddressLine1.trim()) {
      setToast({ message: "请输入详细地址", type: "error" });
      return;
    }

    await addCardWithAddress(addressForm);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="mb-6 text-lg font-medium leading-6 text-gray-900">
            💳 生成虚拟卡
          </h3>

          <div className="space-y-6">
            {/* CDK码输入 */}
            <div>
              <label
                htmlFor="cdkCode"
                className="block text-sm font-medium text-gray-700"
              >
                CDK码 *
              </label>
              <input
                type="text"
                id="cdkCode"
                value={cdkCode}
                onChange={(e) => setCdkCode(e.target.value)}
                className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="例如: F6BF-DD8B-2412-A811"
                disabled={isLoading}
              />
            </div>

            {/* 卡头输入 */}
            <div>
              <label
                htmlFor="customPrefix"
                className="block text-sm font-medium text-gray-700"
              >
                卡头 *
              </label>
              <input
                type="text"
                id="customPrefix"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="例如: 559888039"
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500">
                输入卡号的前几位数字作为卡头
              </p>
            </div>

            {/* 生成按钮 */}
            <div>
              <Button
                onClick={handleGenerate}
                disabled={isLoading || !cdkCode.trim() || !customPrefix.trim()}
                className="flex items-center"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    生成中...
                  </>
                ) : (
                  "🎲 生成虚拟卡"
                )}
              </Button>
            </div>

            {/* 显示生成的卡片 */}
            {generatedCard && (
              <div className="p-4 mt-6 border border-green-200 rounded-md bg-green-50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-green-800">
                    ✅ 虚拟卡生成成功
                  </h4>
                  {remainingCards !== null && (
                    <span className="text-sm text-green-700">
                      剩余: {remainingCards} 张
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">卡号:</span>
                    <span className="font-mono text-gray-900">
                      {generatedCard.cardNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">有效期:</span>
                    <span className="font-mono text-gray-900">
                      {generatedCard.cardExpiry}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">CVC码:</span>
                    <span className="font-mono text-gray-900">
                      {generatedCard.cardCvc}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">卡类型:</span>
                    <span className="text-gray-900">
                      {generatedCard.cardType}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">状态:</span>
                    <span
                      className={
                        generatedCard.isValid
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {generatedCard.isValid ? "有效" : "无效"}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    onClick={handleAddToConfig}
                    variant="primary"
                    className="w-full"
                  >
                    📌 添加到银行卡配置
                  </Button>
                </div>
              </div>
            )}

            {/* 地址信息表单（当需要输入地址时显示） */}
            {showAddressForm && generatedCard && (
              <div className="p-4 mt-6 border border-blue-200 rounded-md bg-blue-50">
                <h4 className="mb-4 text-sm font-medium text-blue-800">
                  📍 请填写账单地址信息
                </h4>
                <form onSubmit={handleAddressSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        value={addressForm.billingName}
                        onChange={(e) =>
                          setAddressForm({
                            ...addressForm,
                            billingName: e.target.value,
                          })
                        }
                        className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="例如: Zhang San"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="billingCountry"
                        className="block text-sm font-medium text-gray-700"
                      >
                        国家/地区
                      </label>
                      <select
                        id="billingCountry"
                        value={addressForm.billingCountry}
                        onChange={(e) =>
                          setAddressForm({
                            ...addressForm,
                            billingCountry: e.target.value,
                          })
                        }
                        className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="China">中国</option>
                        <option value="United States">美国</option>
                        <option value="United Kingdom">英国</option>
                      </select>
                    </div>

                    {addressForm.billingCountry === "China" && (
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
                            value={addressForm.billingPostalCode}
                            onChange={(e) =>
                              setAddressForm({
                                ...addressForm,
                                billingPostalCode: e.target.value,
                              })
                            }
                            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="例如: 100000"
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
                            value={addressForm.billingAdministrativeArea}
                            onChange={(e) =>
                              setAddressForm({
                                ...addressForm,
                                billingAdministrativeArea: e.target.value,
                              })
                            }
                            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            <option value="">请选择省份</option>
                            {CHINA_PROVINCES.map((province) => (
                              <option
                                key={province.value}
                                value={province.value}
                              >
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
                            value={addressForm.billingLocality}
                            onChange={(e) =>
                              setAddressForm({
                                ...addressForm,
                                billingLocality: e.target.value,
                              })
                            }
                            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="例如: 北京市"
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
                            value={addressForm.billingDependentLocality}
                            onChange={(e) =>
                              setAddressForm({
                                ...addressForm,
                                billingDependentLocality: e.target.value,
                              })
                            }
                            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="例如: 朝阳区"
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
                      </label>
                      <input
                        type="text"
                        id="billingAddressLine1"
                        value={addressForm.billingAddressLine1}
                        onChange={(e) =>
                          setAddressForm({
                            ...addressForm,
                            billingAddressLine1: e.target.value,
                          })
                        }
                        className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="例如: XX街道XX号"
                      />
                    </div>
                  </div>

                  <div className="flex pt-4 space-x-3">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      ✅ 确认添加
                    </button>
                    <button
                      type="button"
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      onClick={() => setShowAddressForm(false)}
                    >
                      取消
                    </button>
                  </div>
                </form>
              </div>
            )}
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
    </div>
  );
};
