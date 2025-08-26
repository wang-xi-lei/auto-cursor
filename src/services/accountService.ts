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

  // Add a new account
  static async addAccount(email: string, token: string, refreshToken?: string): Promise<AddAccountResult> {
    return await invoke<AddAccountResult>("add_account", {
      email,
      token,
      refresh_token: refreshToken || null
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
    newRefreshToken?: string
  ): Promise<EditAccountResult> {
    return await invoke<EditAccountResult>("edit_account", {
      email,
      newToken: newToken || null,
      newRefreshToken: newRefreshToken || null
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
