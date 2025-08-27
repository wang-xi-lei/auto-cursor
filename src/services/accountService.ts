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
}
