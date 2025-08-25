use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use anyhow::{Result, anyhow};
use base64::{Engine as _, engine::general_purpose};
use std::path::PathBuf;
use std::fs;
use dirs;
use rusqlite::Connection;
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAuthInfo {
    pub is_authorized: bool,
    pub token_length: usize,
    pub token_valid: bool,
    pub api_status: Option<u16>,
    pub error_message: Option<String>,
    pub checksum: Option<String>,
    pub account_info: Option<AccountInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub email: Option<String>,
    pub username: Option<String>,
    pub subscription_type: Option<String>,
    pub subscription_status: Option<String>,
    pub trial_days_remaining: Option<i32>,
    pub usage_info: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthCheckResult {
    pub success: bool,
    pub user_info: Option<UserAuthInfo>,
    pub message: String,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub token: Option<String>,
    pub source: String,
    pub found: bool,
    pub message: String,
}

pub struct AuthChecker;

impl AuthChecker {
    pub fn new() -> Self {
        Self
    }

    /// Find Cursor installation paths by searching common locations
    fn find_cursor_paths() -> Result<Vec<PathBuf>> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| anyhow!("Could not find home directory"))?;

        let mut possible_paths = Vec::new();

        #[cfg(target_os = "macos")]
        {
            possible_paths.extend([
                home_dir.join("Library/Application Support/Cursor"),
                home_dir.join("Library/Application Support/cursor"),
                PathBuf::from("/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench"),
            ]);
        }

        #[cfg(target_os = "windows")]
        {
            possible_paths.extend([
                home_dir.join("AppData/Roaming/Cursor"),
                home_dir.join("AppData/Local/Cursor"),
                home_dir.join("AppData/Roaming/cursor"),
                home_dir.join("AppData/Local/cursor"),
            ]);
        }

        #[cfg(target_os = "linux")]
        {
            possible_paths.extend([
                home_dir.join(".config/Cursor"),
                home_dir.join(".config/cursor"),
                home_dir.join(".cursor"),
                PathBuf::from("/opt/cursor"),
                PathBuf::from("/usr/share/cursor"),
            ]);
        }

        // Filter to only existing paths
        let existing_paths: Vec<PathBuf> = possible_paths
            .into_iter()
            .filter(|path| path.exists())
            .collect();

        Ok(existing_paths)
    }

    /// Get Cursor paths for different platforms
    fn get_cursor_paths() -> Result<(PathBuf, PathBuf, PathBuf)> {
        let cursor_paths = Self::find_cursor_paths()?;

        if cursor_paths.is_empty() {
            return Err(anyhow!("No Cursor installation found"));
        }

        // Try each found path to see if it contains the expected structure
        for base_path in &cursor_paths {
            let storage_path = base_path.join("User/globalStorage/storage.json");
            let sqlite_path = base_path.join("User/globalStorage/state.vscdb");  // 修正：指向具体的 SQLite 文件
            let session_path = base_path.join("Session Storage");

            // If at least one of these paths exists, use this base path
            if storage_path.exists() || sqlite_path.exists() || session_path.exists() {
                return Ok((storage_path, sqlite_path, session_path));
            }
        }

        // If no valid structure found, return the first path anyway for error reporting
        let base_path = &cursor_paths[0];
        let storage_path = base_path.join("User/globalStorage/storage.json");
        let sqlite_path = base_path.join("User/globalStorage/state.vscdb");  // 修正：指向具体的 SQLite 文件
        let session_path = base_path.join("Session Storage");

        Ok((storage_path, sqlite_path, session_path))
    }

    /// Try to get token from storage.json
    fn get_token_from_storage(storage_path: &PathBuf) -> Result<Option<String>> {
        if !storage_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(storage_path)?;
        let storage_data: serde_json::Value = serde_json::from_str(&content)?;

        // Try to get cursorAuth/accessToken first (most likely location)
        if let Some(token) = storage_data.get("cursorAuth/accessToken").and_then(|v| v.as_str()) {
            if !token.is_empty() && token.len() > 20 {
                return Ok(Some(token.to_string()));
            }
        }

        // Try other possible keys containing "token"
        if let Some(obj) = storage_data.as_object() {
            for (key, value) in obj {
                if key.to_lowercase().contains("token") {
                    if let Some(token) = value.as_str() {
                        if !token.is_empty() && token.len() > 20 {
                            return Ok(Some(token.to_string()));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Try to get token from SQLite database
    fn get_token_from_sqlite(sqlite_path: &PathBuf) -> Result<Option<String>> {
        if !sqlite_path.exists() {
            return Ok(None);
        }

        let conn = Connection::open(sqlite_path)?;

        let mut stmt = conn.prepare("SELECT value FROM ItemTable WHERE key LIKE '%token%'")?;
        let rows = stmt.query_map([], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;

        for row in rows {
            if let Ok(value) = row {
                if value.len() > 20 {
                    // First try to return the value directly if it looks like a token
                    if !value.starts_with('{') && !value.starts_with('[') {
                        return Ok(Some(value));
                    }

                    // Try to parse as JSON
                    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&value) {
                        if let Some(token) = json_value.get("token").and_then(|v| v.as_str()) {
                            if !token.is_empty() && token.len() > 20 {
                                return Ok(Some(token.to_string()));
                            }
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Try to get token from session storage
    fn get_token_from_session(session_path: &PathBuf) -> Result<Option<String>> {
        if !session_path.exists() {
            return Ok(None);
        }

        let entries = fs::read_dir(session_path)?;
        let token_regex = Regex::new(r#""token":"([^"]+)""#)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("log") {
                if let Ok(content) = fs::read(&path) {
                    // Try to decode as UTF-8, ignore errors
                    let content_str = String::from_utf8_lossy(&content);

                    if let Some(captures) = token_regex.captures(&content_str) {
                        if let Some(token) = captures.get(1) {
                            let token_str = token.as_str();
                            if !token_str.is_empty() && token_str.len() > 20 {
                                return Ok(Some(token_str.to_string()));
                            }
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Try to get token from environment variables
    fn get_token_from_env() -> Option<String> {
        std::env::var("CURSOR_TOKEN").ok()
            .or_else(|| std::env::var("CURSOR_AUTH_TOKEN").ok())
            .filter(|token| !token.is_empty())
    }

    /// Debug method to show all possible Cursor paths
    pub fn debug_cursor_paths() -> Result<Vec<String>> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| anyhow!("Could not find home directory"))?;

        let mut debug_info = Vec::new();
        debug_info.push(format!("Home directory: {}", home_dir.display()));

        let cursor_paths = Self::find_cursor_paths()?;
        debug_info.push(format!("Found {} Cursor installation paths:", cursor_paths.len()));

        for (i, path) in cursor_paths.iter().enumerate() {
            debug_info.push(format!("  {}. {} (exists: {})", i + 1, path.display(), path.exists()));

            // Check subdirectories
            let storage_path = path.join("User/globalStorage/storage.json");
            let sqlite_path = path.join("User/workspaceStorage");
            let session_path = path.join("Session Storage");

            debug_info.push(format!("     Storage: {} (exists: {})", storage_path.display(), storage_path.exists()));
            debug_info.push(format!("     SQLite:  {} (exists: {})", sqlite_path.display(), sqlite_path.exists()));
            debug_info.push(format!("     Session: {} (exists: {})", session_path.display(), session_path.exists()));

            // List contents of User directory if it exists
            let user_dir = path.join("User");
            if user_dir.exists() {
                debug_info.push(format!("     User directory contents:"));
                if let Ok(entries) = fs::read_dir(&user_dir) {
                    for entry in entries.flatten() {
                        debug_info.push(format!("       - {}", entry.file_name().to_string_lossy()));
                    }
                }
            }
        }

        Ok(debug_info)
    }

    /// Auto-detect and get token from various sources
    pub fn get_token_auto() -> TokenInfo {
        // Try environment variables first
        if let Some(token) = Self::get_token_from_env() {
            return TokenInfo {
                token: Some(token),
                source: "Environment Variable".to_string(),
                found: true,
                message: "Token found in environment variables".to_string(),
            };
        }

        // Get Cursor paths
        let paths = match Self::get_cursor_paths() {
            Ok(paths) => paths,
            Err(e) => {
                return TokenInfo {
                    token: None,
                    source: "Error".to_string(),
                    found: false,
                    message: format!("Error getting Cursor paths: {}", e),
                };
            }
        };

        let (storage_path, sqlite_path, session_path) = paths;

        // Try storage.json first
        match Self::get_token_from_storage(&storage_path) {
            Ok(Some(token)) => {
                return TokenInfo {
                    token: Some(token),
                    source: "Cursor Storage (storage.json)".to_string(),
                    found: true,
                    message: format!("Token found in storage file: {}", storage_path.display()),
                };
            }
            Ok(None) => {
                // Continue to next method
            }
            Err(e) => {
                // Log error but continue to next method
                eprintln!("Error reading storage.json: {}", e);
            }
        }

        // Try SQLite database
        match Self::get_token_from_sqlite(&sqlite_path) {
            Ok(Some(token)) => {
                return TokenInfo {
                    token: Some(token),
                    source: "Cursor SQLite Database".to_string(),
                    found: true,
                    message: format!("Token found in SQLite database: {}", sqlite_path.display()),
                };
            }
            Ok(None) => {
                // Continue to next method
            }
            Err(e) => {
                // Log error but continue to next method
                eprintln!("Error reading SQLite database: {}", e);
            }
        }

        // Try session storage
        match Self::get_token_from_session(&session_path) {
            Ok(Some(token)) => {
                return TokenInfo {
                    token: Some(token),
                    source: "Cursor Session Storage".to_string(),
                    found: true,
                    message: format!("Token found in session storage: {}", session_path.display()),
                };
            }
            Ok(None) => {
                // Continue to not found
            }
            Err(e) => {
                // Log error but continue
                eprintln!("Error reading session storage: {}", e);
            }
        }

        // No token found
        TokenInfo {
            token: None,
            source: "None".to_string(),
            found: false,
            message: format!(
                "No token found in any location. Searched:\n- Environment variables\n- Storage: {}\n- SQLite: {}\n- Session: {}",
                storage_path.display(),
                sqlite_path.display(),
                session_path.display()
            ),
        }
    }

    /// Generate a SHA-256 hash of input + salt and return as hex
    fn generate_hashed64_hex(input: &str, salt: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(format!("{}{}", input, salt).as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Obfuscate bytes using the algorithm from utils.js
    fn obfuscate_bytes(mut byte_array: Vec<u8>) -> Vec<u8> {
        let mut t = 165u8;
        for (r, byte) in byte_array.iter_mut().enumerate() {
            *byte = ((*byte ^ t).wrapping_add((r % 256) as u8)) & 0xFF;
            t = *byte;
        }
        byte_array
    }

    /// Generate Cursor checksum from token using the algorithm
    fn generate_cursor_checksum(token: &str) -> Result<String> {
        let clean_token = token.trim();
        
        // Generate machineId and macMachineId
        let machine_id = Self::generate_hashed64_hex(clean_token, "machineId");
        let mac_machine_id = Self::generate_hashed64_hex(clean_token, "macMachineId");
        
        // Get timestamp and convert to byte array
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis() as u64 / 1000000;
        
        // Convert timestamp to bytes and take last 6 bytes
        let timestamp_bytes = timestamp.to_be_bytes();
        let byte_array = timestamp_bytes[2..].to_vec(); // Take last 6 bytes
        
        // Obfuscate bytes and encode as base64
        let obfuscated_bytes = Self::obfuscate_bytes(byte_array);
        let encoded_checksum = general_purpose::STANDARD.encode(&obfuscated_bytes);
        
        // Combine final checksum
        Ok(format!("{}{}/{}", encoded_checksum, machine_id, mac_machine_id))
    }

    /// Clean and validate token
    fn clean_token(token: &str) -> Result<String> {
        let mut clean_token = token.to_string();
        
        // Handle URL encoded tokens
        if clean_token.contains("%3A%3A") {
            clean_token = clean_token.split("%3A%3A")
                .nth(1)
                .ok_or_else(|| anyhow!("Invalid token format"))?
                .to_string();
        } else if clean_token.contains("::") {
            clean_token = clean_token.split("::")
                .nth(1)
                .ok_or_else(|| anyhow!("Invalid token format"))?
                .to_string();
        }
        
        clean_token = clean_token.trim().to_string();
        
        if clean_token.is_empty() || clean_token.len() < 10 {
            return Err(anyhow!("Token is too short or empty"));
        }
        
        Ok(clean_token)
    }

    /// Check if token looks like a valid JWT
    fn is_jwt_like(token: &str) -> bool {
        token.starts_with("eyJ") && token.contains('.') && token.len() > 100
    }

    /// Get email from local storage files
    fn get_email_from_local_storage() -> Option<String> {
        // Try to get email from storage.json first
        if let Some(email) = Self::get_email_from_storage() {
            return Some(email);
        }

        // If not found in storage.json, try SQLite database
        if let Some(email) = Self::get_email_from_sqlite() {
            return Some(email);
        }

        None
    }

    /// Get email from storage.json
    fn get_email_from_storage() -> Option<String> {
        if let Some(storage_path) = Self::get_cursor_storage_path() {
            if let Ok(content) = std::fs::read_to_string(&storage_path) {
                if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&content) {
                    // Try cursorAuth/cachedEmail first
                    if let Some(email) = json_data.get("cursorAuth/cachedEmail") {
                        if let Some(email_str) = email.as_str() {
                            println!("📧 从storage.json找到邮箱: {}", email_str);
                            return Some(email_str.to_string());
                        }
                    }

                    // Try other email fields
                    if let Some(obj) = json_data.as_object() {
                        for (key, value) in obj {
                            if key.to_lowercase().contains("email") {
                                if let Some(email_str) = value.as_str() {
                                    if email_str.contains('@') {
                                        println!("📧 从storage.json的{}字段找到邮箱: {}", key, email_str);
                                        return Some(email_str.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    }

    /// Get email from SQLite database
    fn get_email_from_sqlite() -> Option<String> {
        if let Some(sqlite_path) = Self::get_cursor_sqlite_path() {
            match rusqlite::Connection::open(&sqlite_path) {
                Ok(conn) => {
                    println!("🔍 正在从SQLite数据库查找邮箱: {}", sqlite_path);

                    // Query records containing email or cursorAuth
                    let query = "SELECT value FROM ItemTable WHERE key LIKE '%email%' OR key LIKE '%cursorAuth%'";

                    match conn.prepare(query) {
                        Ok(mut stmt) => {
                            match stmt.query_map([], |row| {
                                let value: String = row.get(0)?;
                                Ok(value)
                            }) {
                                Ok(rows) => {
                                    for row_result in rows {
                                        if let Ok(value) = row_result {
                                            // If it's a string and contains @, it might be an email
                                            if value.contains('@') && value.len() > 5 && value.len() < 100 {
                                                println!("📧 从SQLite直接找到邮箱: {}", value);
                                                return Some(value);
                                            }

                                            // Try to parse as JSON
                                            if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&value) {
                                                if let Some(obj) = json_data.as_object() {
                                                    // Check for email field
                                                    if let Some(email) = obj.get("email") {
                                                        if let Some(email_str) = email.as_str() {
                                                            println!("📧 从SQLite JSON email字段找到邮箱: {}", email_str);
                                                            return Some(email_str.to_string());
                                                        }
                                                    }

                                                    // Check for cachedEmail field
                                                    if let Some(cached_email) = obj.get("cachedEmail") {
                                                        if let Some(email_str) = cached_email.as_str() {
                                                            println!("📧 从SQLite JSON cachedEmail字段找到邮箱: {}", email_str);
                                                            return Some(email_str.to_string());
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    println!("❌ SQLite查询执行失败: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            println!("❌ SQLite查询准备失败: {}", e);
                        }
                    }
                }
                Err(e) => {
                    println!("❌ 无法打开SQLite数据库: {}", e);
                }
            }
        }
        None
    }

    /// Get Cursor SQLite database path
    fn get_cursor_sqlite_path() -> Option<String> {
        #[cfg(target_os = "macos")]
        {
            let home_dir = std::env::var("HOME").ok()?;
            let sqlite_path = format!("{}/Library/Application Support/Cursor/User/globalStorage/state.vscdb", home_dir);
            println!("🔍 检查macOS SQLite路径: {}", sqlite_path);
            if std::path::Path::new(&sqlite_path).exists() {
                println!("✅ 找到SQLite文件: {}", sqlite_path);
                Some(sqlite_path)
            } else {
                println!("❌ SQLite文件不存在: {}", sqlite_path);
                None
            }
        }

        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").ok()?;
            let sqlite_path = format!("{}\\Cursor\\User\\globalStorage\\state.vscdb", appdata);
            println!("🔍 检查Windows SQLite路径: {}", sqlite_path);
            if std::path::Path::new(&sqlite_path).exists() {
                println!("✅ 找到SQLite文件: {}", sqlite_path);
                Some(sqlite_path)
            } else {
                println!("❌ SQLite文件不存在: {}", sqlite_path);
                None
            }
        }

        #[cfg(target_os = "linux")]
        {
            let home_dir = std::env::var("HOME").ok()?;
            let sqlite_path = format!("{}/.config/Cursor/User/globalStorage/state.vscdb", home_dir);
            println!("🔍 检查Linux SQLite路径: {}", sqlite_path);
            if std::path::Path::new(&sqlite_path).exists() {
                println!("✅ 找到SQLite文件: {}", sqlite_path);
                Some(sqlite_path)
            } else {
                println!("❌ SQLite文件不存在: {}", sqlite_path);
                None
            }
        }
    }

    /// Get Cursor storage.json path
    fn get_cursor_storage_path() -> Option<String> {
        #[cfg(target_os = "macos")]
        {
            let home_dir = std::env::var("HOME").ok()?;
            let storage_path = format!("{}/Library/Application Support/Cursor/User/globalStorage/storage.json", home_dir);
            println!("🔍 检查macOS存储路径: {}", storage_path);
            if std::path::Path::new(&storage_path).exists() {
                println!("✅ 找到存储文件: {}", storage_path);
                Some(storage_path)
            } else {
                println!("❌ 存储文件不存在: {}", storage_path);
                None
            }
        }

        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").ok()?;
            let storage_path = format!("{}\\Cursor\\User\\globalStorage\\storage.json", appdata);
            println!("🔍 检查Windows存储路径: {}", storage_path);
            if std::path::Path::new(&storage_path).exists() {
                println!("✅ 找到存储文件: {}", storage_path);
                Some(storage_path)
            } else {
                println!("❌ 存储文件不存在: {}", storage_path);
                None
            }
        }

        #[cfg(target_os = "linux")]
        {
            let home_dir = std::env::var("HOME").ok()?;
            let storage_path = format!("{}/.config/Cursor/User/globalStorage/storage.json", home_dir);
            println!("🔍 检查Linux存储路径: {}", storage_path);
            if std::path::Path::new(&storage_path).exists() {
                println!("✅ 找到存储文件: {}", storage_path);
                Some(storage_path)
            } else {
                println!("❌ 存储文件不存在: {}", storage_path);
                None
            }
        }
    }

    /// Get account information from Cursor API
    async fn get_account_info(token: &str, _checksum: &str, details: &mut Vec<String>) -> Result<Option<AccountInfo>> {
        let client = reqwest::Client::new();

        let mut account_info = AccountInfo {
            email: None,
            username: None,
            subscription_type: None,
            subscription_status: None,
            trial_days_remaining: None,
            usage_info: None,
        };

        // First try to get email from local storage (highest priority)
        if let Some(local_email) = Self::get_email_from_local_storage() {
            account_info.email = Some(local_email.clone());
            details.push(format!("Email found in local storage: {}", local_email));
            println!("📧 从本地存储获取到邮箱: {}", local_email);
        } else {
            println!("⚠️ 本地存储中未找到邮箱，将尝试从API获取");
            details.push("Email not found in local storage, will try API".to_string());
        }

        // Try to get subscription info using the correct API endpoint
        details.push("Attempting to get subscription info...".to_string());
        println!("🔍 正在获取订阅信息...");

        let mut subscription_headers = reqwest::header::HeaderMap::new();
        subscription_headers.insert("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36".parse()?);
        subscription_headers.insert("Accept", "application/json".parse()?);
        subscription_headers.insert("Content-Type", "application/json".parse()?);
        subscription_headers.insert("Authorization", format!("Bearer {}", token).parse()?);

        let subscription_response = client
            .get("https://api2.cursor.sh/auth/full_stripe_profile")
            .headers(subscription_headers)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await;

        match subscription_response {
            Ok(resp) => {
                let status = resp.status();
                println!("📡 订阅API响应状态: {}", status);
                details.push(format!("Subscription API response status: {}", status));

                if status.is_success() {
                    match resp.text().await {
                        Ok(body) => {
                            println!("📦 订阅响应数据长度: {} bytes", body.len());
                            println!("📝 订阅响应内容: {}", body);
                            details.push(format!("Subscription response body length: {} bytes", body.len()));
                            details.push(format!("Subscription response content: {}", body));

                            // Try to parse JSON response
                            if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&body) {
                                println!("✅ 成功解析订阅JSON数据");
                                println!("🔍 JSON数据结构: {}", serde_json::to_string_pretty(&json_data).unwrap_or_else(|_| "无法格式化".to_string()));

                                // Extract email from customer info
                                if let Some(customer) = json_data.get("customer") {
                                    if let Some(email) = customer.get("email") {
                                        if let Some(email_str) = email.as_str() {
                                            account_info.email = Some(email_str.to_string());
                                            println!("� 找到邮箱: {}", email_str);
                                        }
                                    }
                                }

                                // Extract subscription type and status
                                if let Some(membership_type) = json_data.get("membershipType") {
                                    if let Some(membership_str) = membership_type.as_str() {
                                        account_info.subscription_type = Some(membership_str.to_string());
                                        println!("� 订阅类型: {}", membership_str);
                                    }
                                }

                                if let Some(subscription_status) = json_data.get("subscriptionStatus") {
                                    if let Some(status_str) = subscription_status.as_str() {
                                        account_info.subscription_status = Some(status_str.to_string());
                                        println!("📊 订阅状态: {}", status_str);
                                    }
                                }

                                // Extract trial days remaining
                                if let Some(days_remaining) = json_data.get("daysRemainingOnTrial") {
                                    if let Some(days) = days_remaining.as_i64() {
                                        account_info.trial_days_remaining = Some(days as i32);
                                        println!("⏰ 试用剩余天数: {}", days);
                                    }
                                }

                                account_info.usage_info = Some("订阅信息获取成功".to_string());
                            } else {
                                println!("❌ 无法解析订阅JSON数据");
                                account_info.subscription_status = Some("数据解析失败".to_string());
                            }
                        }
                        Err(e) => {
                            println!("❌ 读取订阅响应体失败: {}", e);
                            details.push(format!("Failed to read subscription response body: {}", e));
                        }
                    }
                } else {
                    println!("❌ 订阅API失败，状态码: {}", status);
                    details.push(format!("Subscription API failed with status: {}", status));
                }
            }
            Err(e) => {
                println!("❌ 订阅API请求失败: {}", e);
                details.push(format!("Subscription API request failed: {}", e));
            }
        }

        // Try to get usage info using the correct API endpoint
        details.push("Attempting to get usage info...".to_string());
        println!("🔍 正在获取使用情况信息...");

        let mut usage_headers = reqwest::header::HeaderMap::new();
        usage_headers.insert("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36".parse()?);
        usage_headers.insert("Accept", "application/json".parse()?);
        usage_headers.insert("Content-Type", "application/json".parse()?);
        // Use Cookie authentication for usage API
        usage_headers.insert("Cookie", format!("WorkosCursorSessionToken=user_01OOOOOOOOOOOOOOOOOOOOOOOO%3A%3A{}", token).parse()?);

        let user_response = client
            .get("https://www.cursor.com/api/usage")
            .headers(usage_headers)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await;

        match user_response {
            Ok(resp) => {
                let status = resp.status();
                println!("📡 使用情况API响应状态: {}", status);
                details.push(format!("Usage API response status: {}", status));

                if status.is_success() {
                    match resp.text().await {
                        Ok(body) => {
                            println!("📦 使用情况响应数据长度: {} bytes", body.len());
                            println!("📝 使用情况响应内容: {}", body);
                            details.push(format!("Usage response body length: {} bytes", body.len()));
                            details.push(format!("Usage response content: {}", body));

                            // Try to parse JSON response
                            if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&body) {
                                println!("✅ 成功解析使用情况JSON数据");

                                // Extract GPT-4 usage (Premium)
                                if let Some(gpt4_data) = json_data.get("gpt-4") {
                                    if let Some(premium_usage) = gpt4_data.get("numRequestsTotal") {
                                        if let Some(max_usage) = gpt4_data.get("maxRequestUsage") {
                                            let usage_text = format!("Premium: {}/{}",
                                                premium_usage.as_i64().unwrap_or(0),
                                                max_usage.as_i64().unwrap_or(999)
                                            );
                                            println!("⭐ {}", usage_text);

                                            if account_info.usage_info.is_some() {
                                                account_info.usage_info = Some(format!("{}, {}",
                                                    account_info.usage_info.as_ref().unwrap(), usage_text));
                                            } else {
                                                account_info.usage_info = Some(usage_text);
                                            }
                                        }
                                    }
                                }

                                // Extract GPT-3.5 usage (Basic)
                                if let Some(gpt35_data) = json_data.get("gpt-3.5-turbo") {
                                    if let Some(basic_usage) = gpt35_data.get("numRequestsTotal") {
                                        let usage_text = format!("Basic: {}/无限制",
                                            basic_usage.as_i64().unwrap_or(0)
                                        );
                                        println!("� {}", usage_text);

                                        if account_info.usage_info.is_some() {
                                            account_info.usage_info = Some(format!("{}, {}",
                                                account_info.usage_info.as_ref().unwrap(), usage_text));
                                        } else {
                                            account_info.usage_info = Some(usage_text);
                                        }
                                    }
                                }

                                account_info.username = Some("Cursor用户".to_string());
                            } else {
                                println!("❌ 无法解析使用情况JSON数据");
                                if account_info.usage_info.is_none() {
                                    account_info.usage_info = Some("使用情况数据解析失败".to_string());
                                }
                            }
                        }
                        Err(e) => {
                            println!("❌ 读取使用情况响应体失败: {}", e);
                            details.push(format!("Failed to read usage response body: {}", e));
                        }
                    }
                } else {
                    println!("❌ 使用情况API失败，状态码: {}", status);
                    details.push(format!("Usage API failed with status: {}", status));
                }
            }
            Err(e) => {
                println!("❌ 使用情况API请求失败: {}", e);
                details.push(format!("Usage API request failed: {}", e));
            }
        }

        Ok(Some(account_info))
    }

    /// Check user authorization with the given token
    pub async fn check_user_authorized(token: &str) -> Result<AuthCheckResult> {
        let mut details = Vec::new();
        details.push("Starting authorization check...".to_string());
        
        // Clean and validate token
        let clean_token = match Self::clean_token(token) {
            Ok(token) => {
                details.push(format!("Token cleaned successfully, length: {} characters", token.len()));
                token
            }
            Err(e) => {
                return Ok(AuthCheckResult {
                    success: false,
                    user_info: None,
                    message: "Invalid token format".to_string(),
                    details: vec![format!("Token validation failed: {}", e)],
                });
            }
        };

        // Generate checksum
        let checksum = match Self::generate_cursor_checksum(&clean_token) {
            Ok(checksum) => {
                details.push("Checksum generated successfully".to_string());
                checksum
            }
            Err(e) => {
                details.push(format!("Failed to generate checksum: {}", e));
                return Ok(AuthCheckResult {
                    success: false,
                    user_info: None,
                    message: "Failed to generate checksum".to_string(),
                    details,
                });
            }
        };

        // Create HTTP client
        let client = reqwest::Client::new();
        
        // Create request headers
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("accept-encoding", "gzip".parse()?);
        headers.insert("authorization", format!("Bearer {}", clean_token).parse()?);
        headers.insert("connect-protocol-version", "1".parse()?);
        headers.insert("content-type", "application/proto".parse()?);
        headers.insert("user-agent", "connect-es/1.6.1".parse()?);
        headers.insert("x-cursor-checksum", checksum.parse()?);
        headers.insert("x-cursor-client-version", "0.48.7".parse()?);
        headers.insert("x-cursor-timezone", "Asia/Shanghai".parse()?);
        headers.insert("x-ghost-mode", "false".parse()?);
        headers.insert("Host", "api2.cursor.sh".parse()?);

        details.push("Making API request to check usage information...".to_string());

        // Make the API request
        let response = client
            .post("https://api2.cursor.sh/aiserver.v1.DashboardService/GetUsageBasedPremiumRequests")
            .headers(headers)
            .body(vec![]) // Empty body
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await;

        let user_info = match response {
            Ok(resp) => {
                let status_code = resp.status().as_u16();
                details.push(format!("API response status: {}", status_code));

                let is_authorized = match status_code {
                    200 => {
                        details.push("User is authorized (200 OK)".to_string());
                        true
                    }
                    401 | 403 => {
                        details.push("User is unauthorized (401/403)".to_string());
                        false
                    }
                    _ => {
                        details.push(format!("Unexpected status code: {}", status_code));
                        // If token looks like JWT, consider it potentially valid
                        if Self::is_jwt_like(&clean_token) {
                            details.push("Token appears to be in JWT format, considering it potentially valid".to_string());
                            true
                        } else {
                            false
                        }
                    }
                };

                // Get account info if authorized
                let account_info = if is_authorized {
                    details.push("Fetching account information...".to_string());
                    match Self::get_account_info(&clean_token, &checksum, &mut details).await {
                        Ok(info) => {
                            details.push("Account information retrieved successfully".to_string());
                            info
                        }
                        Err(e) => {
                            details.push(format!("Failed to get account info: {}", e));
                            None
                        }
                    }
                } else {
                    None
                };

                UserAuthInfo {
                    is_authorized,
                    token_length: clean_token.len(),
                    token_valid: Self::is_jwt_like(&clean_token),
                    api_status: Some(status_code),
                    error_message: None,
                    checksum: Some(checksum),
                    account_info,
                }
            }
            Err(e) => {
                details.push(format!("API request failed: {}", e));
                
                // If token looks like JWT, consider it potentially valid even if API fails
                let is_authorized = if Self::is_jwt_like(&clean_token) {
                    details.push("Token appears to be in JWT format, considering it potentially valid despite API failure".to_string());
                    true
                } else {
                    false
                };

                UserAuthInfo {
                    is_authorized,
                    token_length: clean_token.len(),
                    token_valid: Self::is_jwt_like(&clean_token),
                    api_status: None,
                    error_message: Some(e.to_string()),
                    checksum: Some(checksum),
                    account_info: None,
                }
            }
        };

        let success = user_info.is_authorized;
        let message = if success {
            "User authorization check completed successfully".to_string()
        } else {
            "User authorization check failed".to_string()
        };

        Ok(AuthCheckResult {
            success,
            user_info: Some(user_info),
            message,
            details,
        })
    }
}
