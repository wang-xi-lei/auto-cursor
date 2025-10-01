use crate::machine_id::MachineIdRestorer;
use crate::{log_debug, log_error, log_info, log_warn};
use anyhow::{Result, anyhow};
use dirs;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub email: String,
    pub token: String,
    pub refresh_token: Option<String>,
    pub workos_cursor_session_token: Option<String>,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct LogoutResult {
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
                refresh_token: None, // Current account doesn't have refresh token stored separately
                workos_cursor_session_token: None,
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
    pub fn add_account(
        email: String,
        token: String,
        refresh_token: Option<String>,
        workos_cursor_session_token: Option<String>,
    ) -> Result<()> {
        let mut accounts = Self::load_accounts()?;

        // Check if account already exists
        if accounts.iter().any(|acc| acc.email == email) {
            return Err(anyhow!("Account with this email already exists"));
        }

        let new_account = AccountInfo {
            email,
            token,
            refresh_token,
            workos_cursor_session_token,
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

    /// Switch to a different account using email and token directly
    pub fn switch_account_with_token(
        email: String,
        token: String,
        auth_type: Option<String>,
    ) -> SwitchAccountResult {
        let mut details = Vec::new();
        let auth_type = auth_type.unwrap_or_else(|| "Auth_0".to_string());

        details.push(format!(
            "Switching to account: {} (auth type: {})",
            email, auth_type
        ));

        // 1. Inject email to SQLite database
        match Self::inject_email_to_sqlite(&email) {
            Ok(()) => {
                details.push("Successfully injected email to SQLite database".to_string());
            }
            Err(e) => {
                details.push(format!("Warning: Failed to inject email to SQLite: {}", e));
            }
        }

        // 2. Inject token to SQLite database with auth type
        match Self::inject_token_to_sqlite_with_auth_type(&token, &auth_type) {
            Ok(()) => {
                details.push(
                    "Successfully injected token and auth type to SQLite database".to_string(),
                );
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
        match Self::update_storage_json(&email, &token) {
            Ok(()) => {
                details.push("Successfully updated storage.json".to_string());
            }
            Err(e) => {
                details.push(format!("Warning: Failed to update storage.json: {}", e));
            }
        }

        // Wait for database updates to complete (CRITICAL!)
        log_debug!("🔍 [DEBUG] Waiting for database updates to complete...");
        std::thread::sleep(std::time::Duration::from_millis(500));
        log_info!("✅ [DEBUG] Database update wait completed");
        details.push("Waited for database updates to complete".to_string());

        SwitchAccountResult {
            success: true,
            message: format!("Successfully switched to account: {}", email),
            details,
        }
    }

    /// Switch to a different account (legacy method - looks up from saved accounts)
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

        // 0. Force close Cursor processes (CRITICAL!)
        log_debug!("🔍 [DEBUG] Checking if Cursor is running...");
        if Self::is_cursor_running() {
            log_debug!("🔍 [DEBUG] Cursor is running, force closing...");
            match Self::force_close_cursor() {
                Ok(()) => {
                    log_info!("✅ [DEBUG] Successfully closed Cursor");
                    details.push("Successfully closed Cursor processes".to_string());
                }
                Err(e) => {
                    log_error!("❌ [DEBUG] Failed to close Cursor: {}", e);
                    details.push(format!("Warning: Failed to close Cursor: {}", e));
                }
            }
        } else {
            log_info!("✅ [DEBUG] Cursor is not running");
            details.push("Cursor is not running".to_string());
        }

        // 1. Inject email to SQLite database
        log_info!(
            "🔍 [DEBUG] Starting email injection for: {}",
            target_account.email
        );
        match Self::inject_email_to_sqlite(&target_account.email) {
            Ok(()) => {
                log_info!("✅ [DEBUG] Email injection successful");
                details.push("Successfully injected email to SQLite database".to_string());
            }
            Err(e) => {
                log_error!("❌ [DEBUG] Email injection failed: {}", e);
                details.push(format!("Warning: Failed to inject email to SQLite: {}", e));
            }
        }

        // 2. Inject token to SQLite database
        log_info!(
            "🔍 [DEBUG] Starting token injection, token length: {}",
            target_account.token.len()
        );
        match Self::inject_token_to_sqlite(&target_account.token) {
            Ok(()) => {
                log_info!("✅ [DEBUG] Token injection successful");
                details.push("Successfully injected token to SQLite database".to_string());
            }
            Err(e) => {
                log_error!("❌ [DEBUG] Token injection failed: {}", e);
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

        // Wait for database updates to complete (CRITICAL!)
        log_debug!("🔍 [DEBUG] Legacy switch - Waiting for database updates to complete...");
        std::thread::sleep(std::time::Duration::from_millis(500));
        log_info!("✅ [DEBUG] Legacy switch - Database update wait completed");
        details.push("Waited for database updates to complete".to_string());

        SwitchAccountResult {
            success: true,
            message: format!("Successfully switched to account: {}", email),
            details,
        }
    }

    /// Inject email to SQLite database with complete email fields
    fn inject_email_to_sqlite(email: &str) -> Result<()> {
        log_info!(
            "🔍 [DEBUG] inject_email_to_sqlite called with email: {}",
            email
        );

        let (_, sqlite_path) = Self::get_cursor_paths()?;
        log_debug!("🔍 [DEBUG] SQLite path: {:?}", sqlite_path);

        if !sqlite_path.exists() {
            log_info!(
                "❌ [DEBUG] SQLite database not found at path: {:?}",
                sqlite_path
            );
            return Err(anyhow!("SQLite database not found"));
        }

        log_debug!("🔍 [DEBUG] Opening SQLite connection...");
        let conn = Connection::open(&sqlite_path)?;
        log_info!("✅ [DEBUG] SQLite connection opened successfully");

        // Set database optimization parameters (skip PRAGMA for now to avoid issues)
        log_debug!("🔍 [DEBUG] Email - Skipping PRAGMA settings to avoid compatibility issues");

        // Begin transaction
        log_debug!("🔍 [DEBUG] Email - Beginning transaction...");
        conn.execute("BEGIN TRANSACTION", [])?;
        log_info!("✅ [DEBUG] Email - Transaction begun successfully");

        // Complete list of email fields to update - based on CursorPool_Client implementation
        let email_fields = vec![
            ("cursorAuth/cachedEmail", email), // Primary email field
            ("cursor.email", email),           // Additional email field
        ];

        let mut success_count = 0;

        for (key, value) in email_fields {
            log_debug!("🔍 [DEBUG] Processing email field: {} = {}", key, value);

            // Check if record exists using direct query
            log_debug!("🔍 [DEBUG] Checking if record exists for key: {}", key);
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM ItemTable WHERE key = ?",
                [key],
                |row| row.get(0),
            )?;
            log_debug!("🔍 [DEBUG] Record exists check result: {}", exists);

            if exists > 0 {
                // Update existing record
                log_info!(
                    "🔍 [DEBUG] Email - Updating existing record for key: {}",
                    key
                );
                match conn.execute("UPDATE ItemTable SET value = ? WHERE key = ?", [value, key]) {
                    Ok(rows_affected) => {
                        if rows_affected > 0 {
                            log_info!(
                                "✅ [DEBUG] Updated email field: {} (rows affected: {})",
                                key,
                                rows_affected
                            );
                            success_count += 1;
                        }
                    }
                    Err(e) => {
                        log_error!("❌ [DEBUG] Failed to update email field {}: {}", key, e);
                    }
                }
            } else {
                // Insert new record
                log_debug!("🔍 [DEBUG] Email - Inserting new record for key: {}", key);
                match conn.execute(
                    "INSERT INTO ItemTable (key, value) VALUES (?, ?)",
                    [key, value],
                ) {
                    Ok(_) => {
                        log_info!("✅ [DEBUG] Inserted new email field: {}", key);
                        success_count += 1;
                    }
                    Err(e) => {
                        log_error!("❌ [DEBUG] Failed to insert email field {}: {}", key, e);
                    }
                }
            }
        }

        if success_count > 0 {
            // Commit transaction
            log_info!(
                "🔍 [DEBUG] Email - Committing transaction with {} successful updates",
                success_count
            );
            conn.execute("COMMIT", [])?;
            log_info!(
                "✅ [DEBUG] Successfully updated {} email fields",
                success_count
            );
        } else {
            // Rollback transaction
            log_error!("❌ [DEBUG] Email - Rolling back transaction, no successful updates");
            conn.execute("ROLLBACK", [])?;
            return Err(anyhow!("Failed to update any email fields"));
        }

        Ok(())
    }

    /// Inject token to SQLite database with complete authentication fields
    fn inject_token_to_sqlite(token: &str) -> Result<()> {
        log_info!(
            "🔍 [DEBUG] inject_token_to_sqlite called with token length: {}",
            token.len()
        );

        let (_, sqlite_path) = Self::get_cursor_paths()?;
        log_info!(
            "🔍 [DEBUG] Token injection - SQLite path: {:?}",
            sqlite_path
        );

        if !sqlite_path.exists() {
            log_info!(
                "❌ [DEBUG] Token injection - SQLite database not found at path: {:?}",
                sqlite_path
            );
            return Err(anyhow!("SQLite database not found"));
        }

        log_debug!("🔍 [DEBUG] Token injection - Opening SQLite connection...");
        let conn = Connection::open(&sqlite_path)?;
        log_info!("✅ [DEBUG] Token injection - SQLite connection opened successfully");

        // Process token - handle formats like "user_01XXX%3A%3Atoken" or "user_01XXX::token"
        let processed_token = if token.contains("%3A%3A") {
            token.split("%3A%3A").nth(1).unwrap_or(token)
        } else if token.contains("::") {
            token.split("::").nth(1).unwrap_or(token)
        } else {
            token
        };

        log_info!(
            "Processing token: original length {}, processed length {}",
            token.len(),
            processed_token.len()
        );

        // Set database optimization parameters (skip PRAGMA for now to avoid issues)
        log_debug!("🔍 [DEBUG] Token - Skipping PRAGMA settings to avoid compatibility issues");

        // Begin transaction
        log_debug!("🔍 [DEBUG] Token - Beginning transaction...");
        conn.execute("BEGIN TRANSACTION", [])?;
        log_info!("✅ [DEBUG] Token - Transaction begun successfully");

        // Complete list of authentication fields to update - this is the key fix!
        let auth_fields = vec![
            ("cursorAuth/accessToken", processed_token),
            ("cursorAuth/refreshToken", processed_token), // refreshToken = accessToken
            ("cursor.accessToken", processed_token),      // Additional token field
            ("cursorAuth/cachedSignUpType", "Auth_0"),    // Authentication type - CRITICAL!
        ];

        let mut success_count = 0;

        for (key, value) in auth_fields {
            log_debug!("🔍 [DEBUG] Processing token field: {} = {}", key, value);

            // Check if record exists using direct query
            log_info!(
                "🔍 [DEBUG] Token - Checking if record exists for key: {}",
                key
            );
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM ItemTable WHERE key = ?",
                [key],
                |row| row.get(0),
            )?;
            log_debug!("🔍 [DEBUG] Token - Record exists check result: {}", exists);

            if exists > 0 {
                // Update existing record
                log_info!(
                    "🔍 [DEBUG] Token - Updating existing record for key: {}",
                    key
                );
                match conn.execute("UPDATE ItemTable SET value = ? WHERE key = ?", [value, key]) {
                    Ok(rows_affected) => {
                        if rows_affected > 0 {
                            log_info!(
                                "✅ [DEBUG] Updated token field: {} (rows affected: {})",
                                key,
                                rows_affected
                            );
                            success_count += 1;
                        }
                    }
                    Err(e) => {
                        log_error!("❌ [DEBUG] Failed to update token field {}: {}", key, e);
                    }
                }
            } else {
                // Insert new record
                log_debug!("🔍 [DEBUG] Token - Inserting new record for key: {}", key);
                match conn.execute(
                    "INSERT INTO ItemTable (key, value) VALUES (?, ?)",
                    [key, value],
                ) {
                    Ok(_) => {
                        log_info!("✅ [DEBUG] Inserted new token field: {}", key);
                        success_count += 1;
                    }
                    Err(e) => {
                        log_error!("❌ [DEBUG] Failed to insert token field {}: {}", key, e);
                    }
                }
            }
        }

        if success_count > 0 {
            // Commit transaction
            log_info!(
                "🔍 [DEBUG] Token - Committing transaction with {} successful updates",
                success_count
            );
            conn.execute("COMMIT", [])?;
            log_info!(
                "✅ [DEBUG] Successfully updated {} authentication fields",
                success_count
            );
        } else {
            // Rollback transaction
            log_error!("❌ [DEBUG] Token - Rolling back transaction, no successful updates");
            conn.execute("ROLLBACK", [])?;
            return Err(anyhow!("Failed to update any authentication fields"));
        }

        Ok(())
    }

    /// Inject token to SQLite database with custom auth type
    fn inject_token_to_sqlite_with_auth_type(token: &str, auth_type: &str) -> Result<()> {
        let (_, sqlite_path) = Self::get_cursor_paths()?;

        if !sqlite_path.exists() {
            return Err(anyhow!("SQLite database not found"));
        }

        let conn = Connection::open(&sqlite_path)?;

        // Process token - handle formats like "user_01XXX%3A%3Atoken" or "user_01XXX::token"
        let processed_token = if token.contains("%3A%3A") {
            token.split("%3A%3A").nth(1).unwrap_or(token)
        } else if token.contains("::") {
            token.split("::").nth(1).unwrap_or(token)
        } else {
            token
        };

        log_info!(
            "Processing token with auth type {}: original length {}, processed length {}",
            auth_type,
            token.len(),
            processed_token.len()
        );

        // Set database optimization parameters (skip PRAGMA for now to avoid issues)
        log_info!(
            "🔍 [DEBUG] Token with auth type - Skipping PRAGMA settings to avoid compatibility issues"
        );

        // Begin transaction
        conn.execute("BEGIN TRANSACTION", [])?;

        // Complete list of authentication fields to update with custom auth type
        let auth_fields = vec![
            ("cursorAuth/accessToken", processed_token),
            ("cursorAuth/refreshToken", processed_token), // refreshToken = accessToken
            ("cursor.accessToken", processed_token),      // Additional token field
            ("cursorAuth/cachedSignUpType", auth_type),   // Custom authentication type
        ];

        let mut success_count = 0;

        for (key, value) in auth_fields {
            // Check if record exists using direct query
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM ItemTable WHERE key = ?",
                [key],
                |row| row.get(0),
            )?;

            if exists > 0 {
                // Update existing record
                match conn.execute("UPDATE ItemTable SET value = ? WHERE key = ?", [value, key]) {
                    Ok(rows_affected) => {
                        if rows_affected > 0 {
                            log_info!("Updated field: {} (rows affected: {})", key, rows_affected);
                            success_count += 1;
                        }
                    }
                    Err(e) => {
                        log_info!("Failed to update field {}: {}", key, e);
                    }
                }
            } else {
                // Insert new record
                match conn.execute(
                    "INSERT INTO ItemTable (key, value) VALUES (?, ?)",
                    [key, value],
                ) {
                    Ok(_) => {
                        log_info!("Inserted new field: {}", key);
                        success_count += 1;
                    }
                    Err(e) => {
                        log_info!("Failed to insert field {}: {}", key, e);
                    }
                }
            }
        }

        if success_count > 0 {
            // Commit transaction
            conn.execute("COMMIT", [])?;
            log_info!(
                "Successfully updated {} authentication fields with auth type {}",
                success_count,
                auth_type
            );
        } else {
            // Rollback transaction
            conn.execute("ROLLBACK", [])?;
            return Err(anyhow!("Failed to update any authentication fields"));
        }

        Ok(())
    }

    /// Check if Cursor is running
    fn is_cursor_running() -> bool {
        use std::process::Command;

        #[cfg(target_os = "windows")]
        {
            let output = Command::new("tasklist")
                .args(&["/FI", "IMAGENAME eq Cursor.exe"])
                .output();

            if let Ok(output) = output {
                let output_str = String::from_utf8_lossy(&output.stdout);
                return output_str.contains("Cursor.exe");
            }
        }

        #[cfg(target_os = "macos")]
        {
            let output = Command::new("pgrep").args(&["-f", "Cursor"]).output();

            if let Ok(output) = output {
                return !output.stdout.is_empty();
            }
        }

        #[cfg(target_os = "linux")]
        {
            // 更精确地匹配 Cursor IDE 进程，排除 auto-cursor
            // 方法1: 尝试匹配 cursor 可执行文件（通常在 .cursor-server 或 AppImage 中）
            let output = Command::new("pgrep")
                .args(&["-f", "cursor.*--"])
                .output();

            if let Ok(output) = output {
                if !output.stdout.is_empty() {
                    return true;
                }
            }

            // 方法2: 尝试匹配包含 .cursor 配置目录的进程
            let output2 = Command::new("pgrep")
                .args(&["-f", "\\.cursor"])
                .output();

            if let Ok(output2) = output2 {
                if !output2.stdout.is_empty() {
                    // 需要排除 auto-cursor 进程
                    let pids = String::from_utf8_lossy(&output2.stdout);
                    let current_pid = std::process::id();
                    
                    for pid in pids.lines() {
                        if let Ok(pid_num) = pid.trim().parse::<u32>() {
                            if pid_num != current_pid {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        false
    }

    /// Force close Cursor processes
    fn force_close_cursor() -> Result<()> {
        use std::process::Command;

        #[cfg(target_os = "windows")]
        {
            let output = Command::new("taskkill")
                .args(&["/F", "/IM", "Cursor.exe"])
                .output();

            match output {
                Ok(_) => {
                    log_info!("✅ [DEBUG] Windows: Cursor processes terminated");
                    Ok(())
                }
                Err(e) => {
                    log_error!("❌ [DEBUG] Windows: Failed to terminate Cursor: {}", e);
                    Err(anyhow!("Failed to terminate Cursor on Windows: {}", e))
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let output = Command::new("pkill").args(&["-f", "Cursor"]).output();

            match output {
                Ok(_) => {
                    log_info!("✅ [DEBUG] macOS: Cursor processes terminated");
                    Ok(())
                }
                Err(e) => {
                    log_error!("❌ [DEBUG] macOS: Failed to terminate Cursor: {}", e);
                    Err(anyhow!("Failed to terminate Cursor on macOS: {}", e))
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            // 更精确地终止 Cursor IDE 进程，避免误杀 auto-cursor
            // 方法1: 尝试终止匹配 cursor.*-- 的进程（Cursor IDE 的特征）
            let output1 = Command::new("pkill")
                .args(&["-f", "cursor.*--"])
                .output();

            // 方法2: 获取所有包含 .cursor 的进程，排除当前进程后终止
            let current_pid = std::process::id();
            let pgrep_output = Command::new("pgrep")
                .args(&["-f", "\\.cursor"])
                .output();

            if let Ok(pgrep_result) = pgrep_output {
                let pids = String::from_utf8_lossy(&pgrep_result.stdout);
                for pid in pids.lines() {
                    if let Ok(pid_num) = pid.trim().parse::<u32>() {
                        if pid_num != current_pid {
                            // 终止该进程
                            let _ = Command::new("kill")
                                .args(&["-9", &pid.trim()])
                                .output();
                        }
                    }
                }
            }

            // 检查是否有 Cursor AppImage 进程
            let appimage_output = Command::new("pkill")
                .args(&["-f", "cursor.*AppImage"])
                .output();

            match (output1, appimage_output) {
                (Ok(_), Ok(_)) => {
                    log_info!("✅ [DEBUG] Linux: Cursor processes terminated");
                    Ok(())
                }
                _ => {
                    log_info!("✅ [DEBUG] Linux: Attempted to terminate Cursor processes");
                    Ok(())
                }
            }
        }
    }

    /// Update storage.json with new email and token (CRITICAL for authentication!)
    fn update_storage_json(email: &str, token: &str) -> Result<()> {
        log_info!(
            "🔍 [DEBUG] Updating storage.json with email: {}, token length: {}",
            email,
            token.len()
        );

        let (storage_path, _) = Self::get_cursor_paths()?;
        log_debug!("🔍 [DEBUG] Storage.json path: {:?}", storage_path);

        if !storage_path.exists() {
            log_info!(
                "❌ [DEBUG] storage.json not found at path: {:?}",
                storage_path
            );
            return Err(anyhow!("storage.json not found"));
        }

        let content = fs::read_to_string(&storage_path)?;
        let mut data: serde_json::Value = serde_json::from_str(&content)?;
        log_info!("✅ [DEBUG] Successfully read and parsed storage.json");

        // Process token - handle formats like "user_01XXX%3A%3Atoken" or "user_01XXX::token"
        let processed_token = if token.contains("%3A%3A") {
            token.split("%3A%3A").nth(1).unwrap_or(token)
        } else if token.contains("::") {
            token.split("::").nth(1).unwrap_or(token)
        } else {
            token
        };
        log_info!(
            "🔍 [DEBUG] Processed token length: {}",
            processed_token.len()
        );

        // Update ALL critical authentication fields in storage.json
        if let Some(obj) = data.as_object_mut() {
            // Core authentication fields - CRITICAL!
            obj.insert(
                "cursorAuth/cachedEmail".to_string(),
                serde_json::Value::String(email.to_string()),
            );
            obj.insert(
                "cursorAuth/accessToken".to_string(),
                serde_json::Value::String(processed_token.to_string()),
            );
            obj.insert(
                "cursorAuth/refreshToken".to_string(),
                serde_json::Value::String(processed_token.to_string()),
            );
            obj.insert(
                "cursorAuth/cachedSignUpType".to_string(),
                serde_json::Value::String("Auth_0".to_string()),
            );

            // Additional fields for compatibility
            obj.insert(
                "cursor.email".to_string(),
                serde_json::Value::String(email.to_string()),
            );
            obj.insert(
                "cursor.accessToken".to_string(),
                serde_json::Value::String(processed_token.to_string()),
            );

            log_info!("✅ [DEBUG] Updated all authentication fields in storage.json");
        }

        let updated_content = serde_json::to_string_pretty(&data)?;
        fs::write(&storage_path, updated_content)?;
        log_info!("✅ [DEBUG] Successfully wrote updated storage.json");

        Ok(())
    }

    /// Logout current account - clear all authentication data
    pub fn logout_current_account() -> LogoutResult {
        let mut details = Vec::new();
        let mut success = true;

        log_debug!("🔍 [DEBUG] Starting logout process...");

        // 1. Force close Cursor if running
        if Self::is_cursor_running() {
            details.push("Cursor is running, attempting to close...".to_string());
            match Self::force_close_cursor() {
                Ok(()) => {
                    details.push("Successfully closed Cursor".to_string());
                    // Wait for process to fully terminate
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                }
                Err(e) => {
                    details.push(format!("Warning: Failed to close Cursor: {}", e));
                }
            }
        } else {
            details.push("Cursor is not running".to_string());
        }

        // 2. Clear SQLite database authentication data
        match Self::clear_sqlite_auth_data() {
            Ok(()) => {
                details.push("Successfully cleared SQLite authentication data".to_string());
            }
            Err(e) => {
                success = false;
                details.push(format!("Failed to clear SQLite data: {}", e));
            }
        }

        // 3. Clear storage.json authentication data
        match Self::clear_storage_json_auth_data() {
            Ok(()) => {
                details.push("Successfully cleared storage.json authentication data".to_string());
            }
            Err(e) => {
                details.push(format!("Warning: Failed to clear storage.json: {}", e));
            }
        }

        // 4. Wait for changes to be written
        std::thread::sleep(std::time::Duration::from_millis(500));

        LogoutResult {
            success,
            message: if success {
                "Successfully logged out. Please restart Cursor to complete the logout process."
                    .to_string()
            } else {
                "Logout completed with some warnings. Please restart Cursor.".to_string()
            },
            details,
        }
    }

    /// Clear authentication data from SQLite database
    fn clear_sqlite_auth_data() -> Result<()> {
        log_debug!("🔍 [DEBUG] Clearing SQLite authentication data...");

        let (_, sqlite_path) = Self::get_cursor_paths()?;

        if !sqlite_path.exists() {
            log_error!("❌ [DEBUG] SQLite database not found");
            return Err(anyhow!("SQLite database not found"));
        }

        let conn = Connection::open(&sqlite_path)?;
        log_info!("✅ [DEBUG] SQLite connection opened successfully");

        // Begin transaction
        conn.execute("BEGIN TRANSACTION", [])?;

        // List of authentication fields to clear
        let auth_fields = vec![
            "cursorAuth/accessToken",
            "cursorAuth/refreshToken",
            "cursorAuth/cachedEmail",
            "cursorAuth/cachedSignUpType",
            "cursor.email",
            "cursor.accessToken",
        ];

        let mut cleared_count = 0;
        for field in auth_fields {
            match conn.execute("DELETE FROM ItemTable WHERE key = ?", [field]) {
                Ok(changes) => {
                    if changes > 0 {
                        log_info!("✅ [DEBUG] Cleared field: {}", field);
                        cleared_count += 1;
                    } else {
                        log_info!("ℹ️ [DEBUG] Field not found: {}", field);
                    }
                }
                Err(e) => {
                    log_error!("❌ [DEBUG] Failed to clear field {}: {}", field, e);
                }
            }
        }

        // Commit transaction
        conn.execute("COMMIT", [])?;
        log_info!("✅ [DEBUG] Transaction committed successfully");
        log_info!("📊 [DEBUG] Cleared {} authentication fields", cleared_count);

        Ok(())
    }

    /// Clear authentication data from storage.json
    fn clear_storage_json_auth_data() -> Result<()> {
        log_debug!("🔍 [DEBUG] Clearing storage.json authentication data...");

        let (storage_path, _) = Self::get_cursor_paths()?;

        if !storage_path.exists() {
            log_error!("❌ [DEBUG] storage.json not found");
            return Err(anyhow!("storage.json not found"));
        }

        let content = fs::read_to_string(&storage_path)?;
        let mut data: serde_json::Value = serde_json::from_str(&content)?;
        log_info!("✅ [DEBUG] Successfully read storage.json");

        // List of authentication fields to remove
        let auth_fields = vec![
            "cursorAuth/cachedEmail",
            "cursorAuth/accessToken",
            "cursorAuth/refreshToken",
            "cursorAuth/cachedSignUpType",
            "cursor.email",
            "cursor.accessToken",
        ];

        let mut removed_count = 0;
        if let Some(obj) = data.as_object_mut() {
            for field in auth_fields {
                if obj.remove(field).is_some() {
                    log_info!("✅ [DEBUG] Removed field: {}", field);
                    removed_count += 1;
                } else {
                    log_info!("ℹ️ [DEBUG] Field not found: {}", field);
                }
            }
        }

        let updated_content = serde_json::to_string_pretty(&data)?;
        fs::write(&storage_path, updated_content)?;
        log_info!("✅ [DEBUG] Successfully updated storage.json");
        log_info!("📊 [DEBUG] Removed {} authentication fields", removed_count);

        Ok(())
    }

    /// Edit an existing account
    pub fn edit_account(
        email: String,
        new_token: Option<String>,
        new_refresh_token: Option<String>,
        new_workos_cursor_session_token: Option<String>,
    ) -> Result<()> {
        log_info!(
            "🔍 [DEBUG] AccountManager::edit_account called for email: {}",
            email
        );

        let mut accounts = Self::load_accounts()?;
        log_debug!("🔍 [DEBUG] Loaded {} accounts", accounts.len());

        let account = accounts.iter_mut().find(|acc| acc.email == email);

        match account {
            Some(acc) => {
                log_debug!("🔍 [DEBUG] Found account to edit: {}", acc.email);

                let mut updated = false;
                if let Some(token) = new_token {
                    log_debug!("🔍 [DEBUG] Updating token (length: {})", token.len());
                    acc.token = token;
                    updated = true;
                }
                if let Some(refresh_token) = new_refresh_token {
                    log_info!(
                        "🔍 [DEBUG] Updating refresh_token (length: {})",
                        refresh_token.len()
                    );
                    acc.refresh_token = Some(refresh_token);
                    updated = true;
                }
                if let Some(workos_token) = new_workos_cursor_session_token {
                    log_info!(
                        "🔍 [DEBUG] Updating workos_cursor_session_token (length: {})",
                        workos_token.len()
                    );
                    acc.workos_cursor_session_token = Some(workos_token);
                    updated = true;
                }

                if updated {
                    log_debug!("🔍 [DEBUG] Saving updated accounts to file...");
                    Self::save_accounts(&accounts)?;
                    log_info!("✅ [DEBUG] Account updated and saved successfully");
                } else {
                    log_info!("ℹ️ [DEBUG] No changes to save");
                }

                Ok(())
            }
            None => {
                log_error!("❌ [DEBUG] Account not found: {}", email);
                Err(anyhow!("Account not found"))
            }
        }
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

    /// Export accounts to a specified directory
    pub fn export_accounts(export_path: String) -> Result<String> {
        log_info!(
            "🔍 [DEBUG] AccountManager::export_accounts called with path: {}",
            export_path
        );

        let account_file = Self::get_account_file_path()?;
        log_debug!("🔍 [DEBUG] Source account file: {:?}", account_file);

        if !account_file.exists() {
            return Err(anyhow!("Account file does not exist"));
        }

        let export_file_path = PathBuf::from(&export_path).join("account.json");
        log_debug!("🔍 [DEBUG] Export destination: {:?}", export_file_path);

        // Ensure the export directory exists
        if let Some(parent) = export_file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| anyhow!("Failed to create export directory: {}", e))?;
        }

        // Copy the account file to the export location
        fs::copy(&account_file, &export_file_path)
            .map_err(|e| anyhow!("Failed to copy account file: {}", e))?;

        log_info!(
            "✅ [DEBUG] Account file exported successfully to: {:?}",
            export_file_path
        );
        Ok(export_file_path.to_string_lossy().to_string())
    }

    /// Import accounts from a specified file
    pub fn import_accounts(import_file_path: String) -> Result<String> {
        log_info!(
            "🔍 [DEBUG] AccountManager::import_accounts called with file: {}",
            import_file_path
        );

        let import_path = PathBuf::from(&import_file_path);
        if !import_path.exists() {
            return Err(anyhow!("Import file does not exist"));
        }

        // Validate the imported file by trying to parse it
        let import_content = fs::read_to_string(&import_path)
            .map_err(|e| anyhow!("Failed to read import file: {}", e))?;

        let _imported_accounts: Vec<AccountInfo> = serde_json::from_str(&import_content)
            .map_err(|e| anyhow!("Invalid account file format: {}", e))?;

        let current_account_file = Self::get_account_file_path()?;
        log_info!(
            "🔍 [DEBUG] Current account file: {:?}",
            current_account_file
        );

        // Create backup of current account file if it exists
        if current_account_file.exists() {
            let backup_path = current_account_file.with_file_name("account_back.json");
            log_debug!("🔍 [DEBUG] Creating backup at: {:?}", backup_path);

            fs::copy(&current_account_file, &backup_path)
                .map_err(|e| anyhow!("Failed to create backup: {}", e))?;

            log_info!("✅ [DEBUG] Backup created successfully");
        }

        // Copy the imported file to replace the current account file
        fs::copy(&import_path, &current_account_file)
            .map_err(|e| anyhow!("Failed to import account file: {}", e))?;

        log_info!("✅ [DEBUG] Account file imported successfully");
        Ok(format!(
            "Successfully imported {} accounts",
            _imported_accounts.len()
        ))
    }
}
