import { invoke } from "@tauri-apps/api/core";
import { BankCardConfig, DEFAULT_BANK_CARD_CONFIG } from "../types/bankCardConfig";

export class BankCardConfigService {
  private static readonly CONFIG_FILE_NAME = 'bank_card_config.json';

  /**
   * 获取银行卡配置
   */
  static async getBankCardConfig(): Promise<BankCardConfig> {
    try {
      const result = await invoke<string>('read_bank_card_config');
      if (result) {
        const config = JSON.parse(result) as BankCardConfig;
        // 确保所有必需的字段都存在，如果不存在则使用默认值
        return {
          ...DEFAULT_BANK_CARD_CONFIG,
          ...config,
        };
      }
    } catch (error) {
      console.log('读取银行卡配置失败，使用默认配置:', error);
    }
    return DEFAULT_BANK_CARD_CONFIG;
  }

  /**
   * 保存银行卡配置
   */
  static async saveBankCardConfig(config: BankCardConfig): Promise<{ success: boolean; message: string }> {
    try {
      const configJson = JSON.stringify(config, null, 2);
      await invoke('save_bank_card_config', { config: configJson });
      return { success: true, message: '银行卡配置保存成功' };
    } catch (error) {
      console.error('保存银行卡配置失败:', error);
      return { success: false, message: `保存失败: ${error}` };
    }
  }

  /**
   * 验证银行卡配置
   */
  static validateBankCardConfig(config: BankCardConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.cardNumber || config.cardNumber.length < 13) {
      errors.push('银行卡号至少需要13位数字');
    }

    if (!config.cardExpiry || !/^\d{2}\/\d{2}$/.test(config.cardExpiry)) {
      errors.push('有效期格式应为 MM/YY');
    }

    if (!config.cardCvc || config.cardCvc.length < 3) {
      errors.push('CVC码至少需要3位数字');
    }

    if (!config.billingName.trim()) {
      errors.push('持卡人姓名不能为空');
    }

    if (!config.billingPostalCode.trim()) {
      errors.push('邮政编码不能为空');
    }

    if (!config.billingLocality.trim()) {
      errors.push('城市不能为空');
    }

    if (!config.billingDependentLocality.trim()) {
      errors.push('区县不能为空');
    }

    if (!config.billingAddressLine1.trim()) {
      errors.push('详细地址不能为空');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
