import { invoke } from "@tauri-apps/api/core";
import type { 
  AccountListResult, 
  SwitchAccountResult, 
  AddAccountResult, 
  RemoveAccountResult 
} from "../types/account";

export class AccountService {
  // Get all accounts with current account info
  static async getAccountList(): Promise<AccountListResult> {
    return await invoke<AccountListResult>("get_account_list");
  }

  // Add a new account
  static async addAccount(email: string, token: string): Promise<AddAccountResult> {
    return await invoke<AddAccountResult>("add_account", { email, token });
  }

  // Switch to a different account
  static async switchAccount(email: string): Promise<SwitchAccountResult> {
    return await invoke<SwitchAccountResult>("switch_account", { email });
  }

  // Remove an account
  static async removeAccount(email: string): Promise<RemoveAccountResult> {
    return await invoke<RemoveAccountResult>("remove_account", { email });
  }
}
