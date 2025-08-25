export interface AccountInfo {
  email: string;
  token: string;
  is_current: boolean;
  created_at: string;
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

export interface RemoveAccountResult {
  success: boolean;
  message: string;
}
