export interface AccountInfo {
  email: string;
  token: string;
  refresh_token?: string;
  workos_cursor_session_token?: string;
  is_current: boolean;
  created_at: string;
  subscription_type?: string;
  subscription_status?: string;
  trial_days_remaining?: number;
}

export interface AccountListResult {
  success: boolean;
  accounts: AccountInfo[];
  current_account: AccountInfo | null;
  message: string;
}

export interface SwitchAccountResult {
  success: boolean;
  message: string;
  details: string[];
}

export interface AddAccountResult {
  success: boolean;
  message: string;
}

export interface EditAccountResult {
  success: boolean;
  message: string;
}

export interface RemoveAccountResult {
  success: boolean;
  message: string;
}

export interface LogoutResult {
  success: boolean;
  message: string;
  details: string[];
}
