use crate::machine_id::MachineIdRestorer;
use anyhow::{anyhow, Result};
use dirs;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub email: String,
    pub token: String,
    pub is_current: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountListResult {
    pub success: bool,
    pub accounts: Vec<AccountInfo>,
    pub current_account: Option<AccountInfo>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchAccountResult {
    pub success: bool,
    pub message: String,
    pub details: Vec<String>,
}

pub struct AccountManager;

impl AccountManager {
    pub fn new() -> Self {
        Self
    }

    /// Get the account.json file path (same directory as backup files)
    fn get_account_file_path() -> Result<PathBuf> {
        let (db_path, _) = Self::get_cursor_paths()?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| anyhow!("Could not get parent directory"))?;
        Ok(db_dir.join("account.json"))
    }

    /// Get Cursor paths for different platforms
    #[cfg(target_os = "windows")]
    fn get_cursor_paths() -> Result<(PathBuf, PathBuf)> {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| anyhow!("APPDATA environment variable not set"))?;

        let db_path = PathBuf::from(&appdata)
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("storage.json");

        let sqlite_path = PathBuf::from(&appdata)
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb");

        Ok((db_path, sqlite_path))
    }

    #[cfg(target_os = "macos")]
    fn get_cursor_paths() -> Result<(PathBuf, PathBuf)> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not find home directory"))?;

        let db_path = home
            .join("Library")
            .join("Application Support")
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("storage.json");

        let sqlite_path = home
            .join("Library")
            .join("Application Support")
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb");

        Ok((db_path, sqlite_path))
    }

    #[cfg(target_os = "linux")]
    fn get_cursor_paths() -> Result<(PathBuf, PathBuf)> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not find home directory"))?;

        let db_path = home
            .join(".config")
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("storage.json");

        let sqlite_path = home
            .join(".config")
            .join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb");

        Ok((db_path, sqlite_path))
    }

    /// Load accounts from account.json file
    pub fn load_accounts() -> Result<Vec<AccountInfo>> {
        let account_file = Self::get_account_file_path()?;

        if !account_file.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&account_file)
            .map_err(|e| anyhow!("Failed to read account file: {}", e))?;

        let accounts: Vec<AccountInfo> = serde_json::from_str(&content)
            .map_err(|e| anyhow!("Failed to parse account file: {}", e))?;

        Ok(accounts)
    }

    /// Save accounts to account.json file
    pub fn save_accounts(accounts: &[AccountInfo]) -> Result<()> {
        let account_file = Self::get_account_file_path()?;

        // Ensure directory exists
        if let Some(parent) = account_file.parent() {
            fs::create_dir_all(parent).map_err(|e| anyhow!("Failed to create directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(accounts)
            .map_err(|e| anyhow!("Failed to serialize accounts: {}", e))?;

        fs::write(&account_file, content)
            .map_err(|e| anyhow!("Failed to write account file: {}", e))?;

        Ok(())
    }

    /// Get current account from Cursor storage
    pub fn get_current_account() -> Result<Option<AccountInfo>> {
        // Try to get current email and token from Cursor
        let current_email = Self::get_current_email();
        let current_token = Self::get_current_token();

        if let (Some(email), Some(token)) = (current_email, current_token) {
            Ok(Some(AccountInfo {
                email,
                token,
                is_current: true,
                created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            }))
        } else {
            Ok(None)
        }
    }

    /// Get current email from Cursor storage
    fn get_current_email() -> Option<String> {
        // Try storage.json first
        if let Some(email) = Self::get_email_from_storage() {
            return Some(email);
        }

        // Try SQLite database
        if let Some(email) = Self::get_email_from_sqlite() {
            return Some(email);
        }

        None
    }

    /// Get current token from Cursor storage
    fn get_current_token() -> Option<String> {
        // Use the existing token detection logic from auth_checker
        let token_info = crate::auth_checker::AuthChecker::get_token_auto();
        token_info.token
    }

    /// Get email from storage.json
    fn get_email_from_storage() -> Option<String> {
        let (storage_path, _) = Self::get_cursor_paths().ok()?;

        if !storage_path.exists() {
            return None;
        }

        let content = fs::read_to_string(&storage_path).ok()?;
        let storage_data: serde_json::Value = serde_json::from_str(&content).ok()?;

        // Try cursorAuth/cachedEmail first
        if let Some(email) = storage_data
            .get("cursorAuth/cachedEmail")
            .and_then(|v| v.as_str())
        {
            if email.contains('@') {
                return Some(email.to_string());
            }
        }

        // Try other email fields
        if let Some(obj) = storage_data.as_object() {
            for (key, value) in obj {
                if key.to_lowercase().contains("email") {
                    if let Some(email_str) = value.as_str() {
                        if email_str.contains('@') {
                            return Some(email_str.to_string());
                        }
                    }
                }
            }
        }

        None
    }

    /// Get email from SQLite database
    fn get_email_from_sqlite() -> Option<String> {
        let (_, sqlite_path) = Self::get_cursor_paths().ok()?;

        if !sqlite_path.exists() {
            return None;
        }

        let conn = Connection::open(&sqlite_path).ok()?;
        let query =
            "SELECT value FROM ItemTable WHERE key LIKE '%email%' OR key LIKE '%cursorAuth%'";

        let mut stmt = conn.prepare(query).ok()?;
        let rows = stmt
            .query_map([], |row| {
                let value: String = row.get(0)?;
                Ok(value)
            })
            .ok()?;

        for row_result in rows {
            if let Ok(value) = row_result {
                // If it's a string and contains @, it might be an email
                if value.contains('@') && value.len() > 5 && value.len() < 100 {
                    return Some(value);
                }

                // Try to parse as JSON
                if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&value) {
                    if let Some(obj) = json_data.as_object() {
                        // Check for email field
                        if let Some(email) = obj.get("email") {
                            if let Some(email_str) = email.as_str() {
                                return Some(email_str.to_string());
                            }
                        }

                        // Check for cachedEmail field
                        if let Some(cached_email) = obj.get("cachedEmail") {
                            if let Some(email_str) = cached_email.as_str() {
                                return Some(email_str.to_string());
                            }
                        }
                    }
                }
            }
        }

        None
    }

    /// Add a new account
    pub fn add_account(email: String, token: String) -> Result<()> {
        let mut accounts = Self::load_accounts()?;

        // Check if account already exists
        if accounts.iter().any(|acc| acc.email == email) {
            return Err(anyhow!("Account with this email already exists"));
        }

        let new_account = AccountInfo {
            email,
            token,
            is_current: false,
            created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };

        accounts.push(new_account);
        Self::save_accounts(&accounts)?;

        Ok(())
    }

    /// Get all accounts with current account info
    pub fn get_account_list() -> AccountListResult {
        match Self::load_accounts() {
            Ok(mut accounts) => {
                let current_account = Self::get_current_account().unwrap_or(None);

                // Ensure current account is in the list
                if let Some(ref current) = current_account {
                    let current_exists = accounts.iter().any(|acc| acc.email == current.email);

                    if !current_exists {
                        // Add current account to the list
                        accounts.push(current.clone());
                        // Save the updated list
                        let _ = Self::save_accounts(&accounts);
                    }

                    // Mark current account in the list
                    for account in &mut accounts {
                        account.is_current = account.email == current.email;
                    }
                }

                AccountListResult {
                    success: true,
                    accounts,
                    current_account,
                    message: "Account list loaded successfully".to_string(),
                }
            }
            Err(e) => AccountListResult {
                success: false,
                accounts: Vec::new(),
                current_account: None,
                message: format!("Failed to load accounts: {}", e),
            },
        }
    }

    /// Switch to a different account
    pub fn switch_account(email: String) -> SwitchAccountResult {
        let mut details = Vec::new();

        // Load accounts to find the target account
        let accounts = match Self::load_accounts() {
            Ok(accounts) => accounts,
            Err(e) => {
                return SwitchAccountResult {
                    success: false,
                    message: format!("Failed to load accounts: {}", e),
                    details: vec![e.to_string()],
                };
            }
        };

        let target_account = match accounts.iter().find(|acc| acc.email == email) {
            Some(account) => account,
            None => {
                return SwitchAccountResult {
                    success: false,
                    message: "Account not found".to_string(),
                    details: vec![format!("No account found with email: {}", email)],
                };
            }
        };

        details.push(format!("Switching to account: {}", email));

        // 1. Inject email to SQLite database
        match Self::inject_email_to_sqlite(&target_account.email) {
            Ok(()) => {
                details.push("Successfully injected email to SQLite database".to_string());
            }
            Err(e) => {
                details.push(format!("Warning: Failed to inject email to SQLite: {}", e));
            }
        }

        // 2. Inject token to SQLite database
        match Self::inject_token_to_sqlite(&target_account.token) {
            Ok(()) => {
                details.push("Successfully injected token to SQLite database".to_string());
            }
            Err(e) => {
                return SwitchAccountResult {
                    success: false,
                    message: format!("Failed to inject token: {}", e),
                    details,
                };
            }
        }

        // 3. Update storage.json if possible
        match Self::update_storage_json(&target_account.email, &target_account.token) {
            Ok(()) => {
                details.push("Successfully updated storage.json".to_string());
            }
            Err(e) => {
                details.push(format!("Warning: Failed to update storage.json: {}", e));
            }
        }

        // 4. Inject email update JavaScript to Cursor UI
        match MachineIdRestorer::new() {
            Ok(restorer) => match restorer.inject_email_update_js(&target_account.email) {
                Ok(()) => {
                    details
                        .push("Successfully injected email update script to Cursor UI".to_string());
                }
                Err(e) => {
                    details.push(format!(
                        "Warning: Failed to inject email update script: {}",
                        e
                    ));
                }
            },
            Err(e) => {
                details.push(format!(
                    "Warning: Failed to initialize email updater: {}",
                    e
                ));
            }
        }

        SwitchAccountResult {
            success: true,
            message: format!("Successfully switched to account: {}", email),
            details,
        }
    }

    /// Inject email to SQLite database
    fn inject_email_to_sqlite(email: &str) -> Result<()> {
        let (_, sqlite_path) = Self::get_cursor_paths()?;

        if !sqlite_path.exists() {
            return Err(anyhow!("SQLite database not found"));
        }

        let conn = Connection::open(&sqlite_path)?;

        // Try to update existing email records
        let update_queries = vec![
            "UPDATE ItemTable SET value = ? WHERE key LIKE '%email%'",
            "UPDATE ItemTable SET value = ? WHERE key LIKE '%cursorAuth%' AND value LIKE '%email%'",
        ];

        let mut updated = false;
        for query in update_queries {
            match conn.execute(query, [email]) {
                Ok(rows_affected) => {
                    if rows_affected > 0 {
                        updated = true;
                        println!("Updated {} rows with query: {}", rows_affected, query);
                    }
                }
                Err(e) => {
                    println!("Query failed: {}, error: {}", query, e);
                }
            }
        }

        // If no existing records were updated, insert new ones
        if !updated {
            // Insert email record
            conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                ["cursorAuth/cachedEmail", email],
            )?;

            // Insert email in JSON format for cursorAuth
            let auth_data = serde_json::json!({
                "email": email,
                "cachedEmail": email
            });
            conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                ["cursorAuth", &auth_data.to_string()],
            )?;
        }

        Ok(())
    }

    /// Inject token to SQLite database
    fn inject_token_to_sqlite(token: &str) -> Result<()> {
        let (_, sqlite_path) = Self::get_cursor_paths()?;

        if !sqlite_path.exists() {
            return Err(anyhow!("SQLite database not found"));
        }

        let conn = Connection::open(&sqlite_path)?;

        // Update existing token records
        let update_queries = vec![
            "UPDATE ItemTable SET value = ? WHERE key LIKE '%token%'",
            "UPDATE ItemTable SET value = ? WHERE key LIKE '%accessToken%'",
        ];

        let mut updated = false;
        for query in update_queries {
            match conn.execute(query, [token]) {
                Ok(rows_affected) => {
                    if rows_affected > 0 {
                        updated = true;
                        println!("Updated {} rows with query: {}", rows_affected, query);
                    }
                }
                Err(e) => {
                    println!("Query failed: {}, error: {}", query, e);
                }
            }
        }

        // If no existing records were updated, insert new ones
        if !updated {
            // Insert token record
            conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                ["cursorAuth/accessToken", token],
            )?;

            // Insert token in JSON format
            let token_data = serde_json::json!({
                "token": token,
                "accessToken": token
            });
            conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                ["cursorAuth/tokenData", &token_data.to_string()],
            )?;
        }

        Ok(())
    }

    /// Update storage.json with new email and token
    fn update_storage_json(email: &str, token: &str) -> Result<()> {
        let (storage_path, _) = Self::get_cursor_paths()?;

        if !storage_path.exists() {
            return Err(anyhow!("storage.json not found"));
        }

        let content = fs::read_to_string(&storage_path)?;
        let mut data: serde_json::Value = serde_json::from_str(&content)?;

        // Update email fields
        if let Some(obj) = data.as_object_mut() {
            obj.insert(
                "cursorAuth/cachedEmail".to_string(),
                serde_json::Value::String(email.to_string()),
            );
            obj.insert(
                "cursorAuth/accessToken".to_string(),
                serde_json::Value::String(token.to_string()),
            );

            // Update any existing email fields
            for (key, value) in obj.iter_mut() {
                if key.to_lowercase().contains("email") && value.is_string() {
                    *value = serde_json::Value::String(email.to_string());
                }
                if key.to_lowercase().contains("token") && value.is_string() {
                    *value = serde_json::Value::String(token.to_string());
                }
            }
        }

        let updated_content = serde_json::to_string_pretty(&data)?;
        fs::write(&storage_path, updated_content)?;

        Ok(())
    }

    /// Remove an account
    pub fn remove_account(email: String) -> Result<()> {
        let mut accounts = Self::load_accounts()?;

        let initial_len = accounts.len();
        accounts.retain(|acc| acc.email != email);

        if accounts.len() == initial_len {
            return Err(anyhow!("Account not found"));
        }

        Self::save_accounts(&accounts)?;
        Ok(())
    }
}
