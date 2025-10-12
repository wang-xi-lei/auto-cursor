import { invoke } from "@tauri-apps/api/core";
import type {
  AccountListResult,
  SwitchAccountResult,
  AddAccountResult,
  EditAccountResult,
  RemoveAccountResult,
  LogoutResult
} from "../types/account";

export class AccountService {
  // Get all accounts with current account info
  static async getAccountList(): Promise<AccountListResult> {
    return await invoke<AccountListResult>("get_account_list");
  }

  // Real delete account API - calls cursor.com/api/dashboard/delete-account via Rust backend
  static async deleteAccount(workosSessionToken: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 通过 Rust 后端调用 Cursor 删除账户 API...');

      const result = await invoke<any>("delete_cursor_account", {
        workosCursorSessionToken: workosSessionToken
      });

      console.log('📥 Rust 后端响应:', result);

      return {
        success: result.success || false,
        message: result.message || '未知响应'
      };
    } catch (error) {
      console.error('调用 Rust 后端失败:', error);

      return {
        success: false,
        message: `❌ 调用后端失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // Add a new account
  static async addAccount(email: string, token: string, refreshToken?: string, workosSessionToken?: string): Promise<AddAccountResult> {
    return await invoke<AddAccountResult>("add_account", {
      email,
      token,
      refreshToken: refreshToken || null,
      workosCursorSessionToken: workosSessionToken || null
    });
  }

  // Switch to a different account
  static async switchAccount(email: string): Promise<SwitchAccountResult> {
    return await invoke<SwitchAccountResult>("switch_account", { email });
  }

  // Switch to account using email and token directly (improved method)
  static async switchAccountWithToken(
    email: string,
    token: string,
    authType?: string
  ): Promise<SwitchAccountResult> {
    return await invoke<SwitchAccountResult>("switch_account_with_token", {
      email,
      token,
      authType
    });
  }

  // Edit an existing account
  static async editAccount(
    email: string,
    newToken?: string,
    newRefreshToken?: string,
    newWorkosSessionToken?: string
  ): Promise<EditAccountResult> {
    return await invoke<EditAccountResult>("edit_account", {
      email,
      newToken: newToken || null,
      newRefreshToken: newRefreshToken || null,
      newWorkosCursorSessionToken: newWorkosSessionToken || null
    });
  }

  // Remove an account
  static async removeAccount(email: string): Promise<RemoveAccountResult> {
    return await invoke<RemoveAccountResult>("remove_account", { email });
  }

  // Logout current account - clear all authentication data
  static async logoutCurrentAccount(): Promise<LogoutResult> {
    return await invoke<LogoutResult>("logout_current_account");
  }

  // Open cancel subscription page with WorkOS Session Token
  static async openCancelSubscriptionPage(workosSessionToken: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Opening cancel subscription page...');

      const result = await invoke<any>("open_cancel_subscription_page", {
        workosCursorSessionToken: workosSessionToken
      });

      console.log('📥 Open page result:', result);

      return {
        success: result.success || false,
        message: result.message || '未知响应'
      };
    } catch (error) {
      console.error('Failed to open cancel subscription page:', error);

      return {
        success: false,
        message: `❌ 打开页面失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // Get bind card URL (for copying to clipboard)
  static async getBindCardUrl(workosSessionToken: string): Promise<{ success: boolean; message: string; url?: string }> {
    try {
      console.log('🔄 Getting bind card URL...');

      const result = await invoke<any>("get_bind_card_url", {
        workosCursorSessionToken: workosSessionToken
      });

      console.log('📥 Get bind card URL result:', result);

      return {
        success: result.success || false,
        message: result.message || '未知响应',
        url: result.url
      };
    } catch (error) {
      console.error('Failed to get bind card URL:', error);

      return {
        success: false,
        message: `❌ 获取链接失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // Open manual bind card page with WorkOS Session Token
  static async openManualBindCardPage(workosSessionToken: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Opening manual bind card page...');

      const result = await invoke<any>("open_manual_bind_card_page", {
        workosCursorSessionToken: workosSessionToken
      });

      console.log('📥 Open manual bind card page result:', result);

      return {
        success: result.success || false,
        message: result.message || '未知响应'
      };
    } catch (error) {
      console.error('Failed to open manual bind card page:', error);

      return {
        success: false,
        message: `❌ 打开页面失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // Export accounts to specified directory
  static async exportAccounts(exportPath: string): Promise<{ success: boolean; message: string; exported_path?: string }> {
    try {
      console.log('🔄 Exporting accounts to:', exportPath);

      const result = await invoke<any>("export_accounts", {
        exportPath: exportPath
      });

      console.log('📥 Export result:', result);

      return {
        success: result.success || false,
        message: result.message || '未知响应',
        exported_path: result.exported_path
      };
    } catch (error) {
      console.error('Failed to export accounts:', error);

      return {
        success: false,
        message: `❌ 导出失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // Import accounts from specified file
  static async importAccounts(importFilePath: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Importing accounts from:', importFilePath);

      const result = await invoke<any>("import_accounts", {
        importFilePath: importFilePath
      });

      console.log('📥 Import result:', result);

      return {
        success: result.success || false,
        message: result.message || '未知响应'
      };
    } catch (error) {
      console.error('Failed to import accounts:', error);

      return {
        success: false,
        message: `❌ 导入失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

}
