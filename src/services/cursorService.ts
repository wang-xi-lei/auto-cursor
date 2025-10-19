import { invoke } from "@tauri-apps/api/core";
import { AuthCheckResult, TokenInfo, BackupInfo, MachineIds, RestoreResult, ResetResult } from "../types/auth";

export class CursorService {
  // Cursor Installation
  static async checkCursorInstallation(): Promise<boolean> {
    return await invoke<boolean>("check_cursor_installation");
  }

  static async getCursorPaths(): Promise<[string, string]> {
    return await invoke<[string, string]>("get_cursor_paths");
  }

  static async debugCursorPaths(): Promise<string[]> {
    return await invoke<string[]>("debug_cursor_paths");
  }

  static async getCursorVersion(): Promise<string | null> {
    try {
      return await invoke<string>("get_cursor_version");
    } catch {
      return null;
    }
  }

  // Machine ID Management
  static async getCurrentMachineIds(): Promise<MachineIds> {
    return await invoke<MachineIds>("get_current_machine_ids");
  }

  static async getMachineIdFileContent(): Promise<string> {
    return await invoke<string>("get_machine_id_file_content");
  }

  static async resetMachineIds(): Promise<ResetResult> {
    return await invoke<ResetResult>("reset_machine_ids");
  }

  static async completeResetMachineIds(): Promise<ResetResult> {
    return await invoke<ResetResult>("complete_cursor_reset");
  }

  // Backup Management
  static async getBackups(): Promise<BackupInfo[]> {
    return await invoke<BackupInfo[]>("get_available_backups");
  }

  static async getBackupDebugInfo(): Promise<{ directory: string; files: string[] }> {
    const [directory, files] = await invoke<[string, string[]]>("get_backup_directory_info");
    return { directory, files };
  }

  static async extractBackupIds(backupPath: string): Promise<MachineIds> {
    return await invoke<MachineIds>("extract_backup_ids", { backupPath });
  }

  static async restoreMachineIds(backupPath: string): Promise<RestoreResult> {
    return await invoke<RestoreResult>("restore_machine_ids", { backupPath });
  }

  static async deleteBackup(backupPath: string): Promise<{ success: boolean; message: string }> {
    return await invoke<{ success: boolean; message: string }>("delete_backup", { backupPath });
  }

  // Token Management
  static async getTokenAuto(): Promise<TokenInfo> {
    return await invoke<TokenInfo>("get_token_auto");
  }

  static async checkUserAuthorized(token: string): Promise<AuthCheckResult> {
    return await invoke<AuthCheckResult>("check_user_authorization", { token });
  }

  static async getUserInfo(token: string): Promise<AuthCheckResult> {
    return await invoke<AuthCheckResult>("get_user_info", { token });
  }

  // Logging Management
  static async getLogFilePath(): Promise<string> {
    return await invoke<string>("get_log_file_path");
  }

  static async testLogging(): Promise<string> {
    return await invoke<string>("test_logging");
  }

  static async openLogFile(): Promise<string> {
    return await invoke<string>("open_log_file");
  }

  static async openLogDirectory(): Promise<string> {
    return await invoke<string>("open_log_directory");
  }

  static async readLogFile(): Promise<string> {
    return await invoke<string>("read_log_file");
  }

  static async clearLogFile(): Promise<void> {
    return await invoke<void>("clear_log_file");
  }

  static async debugWindowsCursorPaths(): Promise<string[]> {
    return await invoke<string[]>("debug_windows_cursor_paths");
  }

  static async setCustomCursorPath(path: string): Promise<string> {
    return await invoke<string>("set_custom_cursor_path", { path });
  }

  static async getCustomCursorPath(): Promise<string | null> {
    return await invoke<string | null>("get_custom_cursor_path");
  }

  static async clearCustomCursorPath(): Promise<string> {
    return await invoke<string>("clear_custom_cursor_path");
  }

  // 验证码登录
  static async verificationCodeLogin(
    email: string,
    verificationCode: string,
    showWindow?: boolean
  ): Promise<{ success: boolean; message: string }> {
    return await invoke("verification_code_login", {
      email,
      verificationCode,
      showWindow,
    });
  }

  // 检查验证码登录的 Cookie
  static async checkVerificationLoginCookies(): Promise<void> {
    return await invoke("check_verification_login_cookies");
  }
}
