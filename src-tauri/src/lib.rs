mod account_manager;
mod auth_checker;
mod machine_id;

use account_manager::{AccountListResult, AccountManager, LogoutResult, SwitchAccountResult};
use auth_checker::{AuthCheckResult, AuthChecker, TokenInfo};
use chrono;
use machine_id::{BackupInfo, MachineIdRestorer, MachineIds, ResetResult, RestoreResult};
use rand::{Rng, distributions::Alphanumeric};
use regex::Regex;
use reqwest;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{Emitter, Manager};

// 获取Python可执行文件路径的辅助函数
fn get_python_executable_path() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // 开发环境：使用相对于当前工作目录的路径
        let platform = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else {
            "linux"
        };

        let exe_name = if cfg!(target_os = "windows") {
            "cursor_register.exe"
        } else {
            "cursor_register"
        };

        Ok(std::env::current_dir()
            .map_err(|e| format!("无法获取当前工作目录: {}", e))?
            .join("pyBuild")
            .join(platform)
            .join(exe_name))
    } else {
        // 生产环境：使用相对于exe的路径
        let current_exe =
            std::env::current_exe().map_err(|e| format!("无法获取当前执行文件路径: {}", e))?;
        let exe_dir = current_exe.parent().ok_or("无法获取执行文件目录")?;

        let platform = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else {
            "linux"
        };

        let exe_name = if cfg!(target_os = "windows") {
            "cursor_register.exe"
        } else {
            "cursor_register"
        };

        Ok(exe_dir.join("pyBuild").join(platform).join(exe_name))
    }
}

// 邮箱配置结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
struct EmailConfig {
    worker_domain: String,
    email_domain: String,
    admin_password: String,
}

// Cloudflare临时邮箱相关结构体
#[derive(Debug, Serialize, Deserialize)]
struct CloudflareEmailResponse {
    jwt: Option<String>,
    address: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CloudflareMailsResponse {
    results: Option<Vec<CloudflareMail>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CloudflareMail {
    raw: Option<String>,
}

// 生成随机邮箱名称
fn generate_random_email_name() -> String {
    let letters1: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(5)
        .map(char::from)
        .collect::<String>()
        .to_lowercase();

    let numbers: String = (0..rand::thread_rng().gen_range(1..=3))
        .map(|_| rand::thread_rng().gen_range(0..10).to_string())
        .collect();

    let letters2: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(rand::thread_rng().gen_range(1..=3))
        .map(char::from)
        .collect::<String>()
        .to_lowercase();

    format!("{}{}{}", letters1, numbers, letters2)
}

// 创建临时邮箱
async fn create_cloudflare_temp_email() -> Result<(String, String), String> {
    let client = reqwest::Client::new();
    let random_name = generate_random_email_name();

    // 获取邮箱配置
    let email_config = get_email_config().await?;

    let url = format!("https://{}/admin/new_address", email_config.worker_domain);
    let payload = serde_json::json!({
        "enablePrefix": true,
        "name": random_name,
        "domain": email_config.email_domain,
    });

    println!("🔍 [DEBUG] 创建邮箱请求详情:");
    println!("  URL: {}", url);
    println!("  Headers:");
    println!("    x-admin-auth: {}", email_config.admin_password);
    println!("    Content-Type: application/json");
    println!(
        "  Payload: {}",
        serde_json::to_string_pretty(&payload).unwrap_or_default()
    );

    let response = client
        .post(&url)
        .header("X-Admin-Auth", &email_config.admin_password)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("创建邮箱请求失败: {}", e))?;

    let status = response.status();
    let headers = response.headers().clone();

    println!("🔍 [DEBUG] 响应详情:");
    println!("  状态码: {}", status);
    println!("  响应头: {:?}", headers);

    // 获取响应文本用于调试
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应文本失败: {}", e))?;

    println!("  响应体: {}", response_text);

    if status.is_success() {
        let data: CloudflareEmailResponse = serde_json::from_str(&response_text)
            .map_err(|e| format!("解析响应JSON失败: {} | 响应内容: {}", e, response_text))?;

        println!("🔍 [DEBUG] 解析后的数据: {:?}", data);

        match (data.jwt, data.address) {
            (Some(jwt), Some(address)) => {
                println!("✅ 创建临时邮箱成功: {}", address);
                Ok((jwt, address))
            }
            _ => Err(format!(
                "响应中缺少JWT或邮箱地址 | 完整响应: {}",
                response_text
            )),
        }
    } else {
        Err(format!(
            "创建邮箱失败，状态码: {} | 响应内容: {}",
            status, response_text
        ))
    }
}

// 获取验证码
async fn get_verification_code_from_cloudflare(jwt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    // 获取邮箱配置
    let email_config = get_email_config().await?;

    // 最多尝试30次，每次等待10秒
    for attempt in 1..=30 {
        println!("🔍 第{}次尝试获取验证码...", attempt);

        let url = format!("https://{}/api/mails", email_config.worker_domain);
        println!("🔍 [DEBUG] 获取邮件请求详情:");
        println!("  URL: {}", url);
        println!("  Headers:");
        println!("    Authorization: Bearer {}", jwt);
        println!("    Content-Type: application/json");
        println!("  Query: limit=10&offset=0");

        let response = client
            .get(&url)
            .header("Authorization", &format!("Bearer {}", jwt))
            .header("Content-Type", "application/json")
            .query(&[("limit", "10"), ("offset", "0")])
            .send()
            .await
            .map_err(|e| format!("获取邮件请求失败: {}", e))?;

        let status = response.status();
        println!("🔍 [DEBUG] 获取邮件响应状态码: {}", status);

        if response.status().is_success() {
            let response_text = response
                .text()
                .await
                .map_err(|e| format!("读取邮件响应文本失败: {}", e))?;

            // println!("🔍 [DEBUG] 邮件响应体: {}", response_text);

            let data: CloudflareMailsResponse =
                serde_json::from_str(&response_text).map_err(|e| {
                    format!("解析邮件响应JSON失败: {} | 响应内容: {}", e, response_text)
                })?;

            // println!("🔍 [DEBUG] 解析后的邮件数据: {:?}", data);

            if let Some(results) = data.results {
                println!("🔍 [DEBUG] 邮件数量: {}", results.len());
                if !results.is_empty() {
                    if let Some(raw_content) = &results[0].raw {
                        // println!("🔍 [DEBUG] 第一封邮件原始内容: {}", raw_content);

                        // 使用正则表达式提取验证码 - 第一种方式
                        let re1 = Regex::new(r"code is: (\d{6})").unwrap();
                        if let Some(captures) = re1.captures(raw_content) {
                            if let Some(code) = captures.get(1) {
                                let verification_code = code.as_str().to_string();
                                println!("✅ 成功提取验证码 (方式1): {}", verification_code);
                                return Ok(verification_code);
                            }
                        }

                        // 尝试第二种匹配方式
                        let re2 = Regex::new(r"code is:\s*(\d{6})").unwrap();
                        if let Some(captures) = re2.captures(raw_content) {
                            if let Some(code) = captures.get(1) {
                                let verification_code = code.as_str().to_string();
                                println!("✅ 成功提取验证码 (方式2): {}", verification_code);
                                return Ok(verification_code);
                            }
                        }
                        // 1. 移除颜色代码
                        let color_code_regex = Regex::new(r"#([0-9a-fA-F]{6})\b").unwrap();
                        let content_without_colors = color_code_regex.replace_all(raw_content, "");

                        // 尝试第三种匹配方式：直接匹配连续的6位数字
                        let re3 = Regex::new(r"\b(\d{6})\b").unwrap();
                        if let Some(captures) = re3.captures(&content_without_colors) {
                            if let Some(code) = captures.get(1) {
                                let verification_code = code.as_str().to_string();
                                println!(
                                    "✅ 成功提取验证码 (方式3-连续6位数字): {}",
                                    verification_code
                                );
                                return Ok(verification_code);
                            }
                        }

                        println!("🔍 [DEBUG] 未找到匹配的验证码模式");
                    } else {
                        println!("🔍 [DEBUG] 第一封邮件没有raw内容");
                    }
                } else {
                    println!("🔍 [DEBUG] 邮件列表为空");
                }
            } else {
                println!("🔍 [DEBUG] 响应中没有results字段");
            }
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "无法读取错误响应".to_string());
            println!(
                "🔍 [DEBUG] 获取邮件失败，状态码: {} | 错误内容: {}",
                status, error_text
            );
        }

        // 等待10秒后重试
        println!("⏳ 等待10秒后重试...");
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    }

    Err("获取验证码超时".to_string())
}

// 从Outlook邮箱获取验证码
async fn get_verification_code_from_outlook(email: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let encoded_email = urlencoding::encode(email);

    // 最多尝试30次，每次等待10秒
    for attempt in 1..=30 {
        println!("🔍 第{}次尝试从Outlook获取验证码...", attempt);

        // 获取收件箱邮件
        let inbox_url = format!(
            "http://query.paopaodw.com/api/GetLastEmails?email={}&boxType=1",
            encoded_email
        );
        println!("🔍 [DEBUG] 获取收件箱邮件: {}", inbox_url);

        let inbox_response = client
            .get(&inbox_url)
            .send()
            .await
            .map_err(|e| format!("获取收件箱邮件失败: {}", e))?;

        if inbox_response.status().is_success() {
            let inbox_text = inbox_response
                .text()
                .await
                .map_err(|e| format!("读取收件箱响应失败: {}", e))?;

            println!("🔍 [DEBUG] 收件箱响应: {}", inbox_text);

            if let Ok(inbox_data) = serde_json::from_str::<serde_json::Value>(&inbox_text) {
                if let Some(data) = inbox_data.get("data").and_then(|d| d.as_array()) {
                    for email_item in data {
                        if let Some(body) = email_item.get("Body").and_then(|b| b.as_str()) {
                            if let Some(code) = extract_verification_code_from_content(body) {
                                println!("✅ 从收件箱找到验证码: {}", code);
                                return Ok(code);
                            }
                        }
                    }
                }
            }
        }

        // 获取垃圾箱邮件
        let spam_url = format!(
            "http://query.paopaodw.com/api/GetLastEmails?email={}&boxType=2",
            encoded_email
        );
        println!("🔍 [DEBUG] 获取垃圾箱邮件: {}", spam_url);

        let spam_response = client
            .get(&spam_url)
            .send()
            .await
            .map_err(|e| format!("获取垃圾箱邮件失败: {}", e))?;

        if spam_response.status().is_success() {
            let spam_text = spam_response
                .text()
                .await
                .map_err(|e| format!("读取垃圾箱响应失败: {}", e))?;

            println!("🔍 [DEBUG] 垃圾箱响应: {}", spam_text);

            if let Ok(spam_data) = serde_json::from_str::<serde_json::Value>(&spam_text) {
                if let Some(data) = spam_data.get("data").and_then(|d| d.as_array()) {
                    for email_item in data {
                        if let Some(body) = email_item.get("Body").and_then(|b| b.as_str()) {
                            if let Some(code) = extract_verification_code_from_content(body) {
                                println!("✅ 从垃圾箱找到验证码: {}", code);
                                return Ok(code);
                            }
                        }
                    }
                }
            }
        }

        if attempt < 30 {
            println!("⏰ 第{}次尝试未找到验证码，等待10秒后重试...", attempt);
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    }

    Err("获取验证码超时，请检查邮箱或稍后重试".to_string())
}

// 提取验证码的通用函数（复用现有逻辑）
fn extract_verification_code_from_content(content: &str) -> Option<String> {
    use regex::Regex;

    // 使用现有的验证码提取逻辑
    let re1 = Regex::new(r"code is: (\d{6})").unwrap();
    if let Some(captures) = re1.captures(content) {
        if let Some(code) = captures.get(1) {
            return Some(code.as_str().to_string());
        }
    }

    // 第二种方式
    let re2 = Regex::new(r"验证码为：(\d{6})").unwrap();
    if let Some(captures) = re2.captures(content) {
        if let Some(code) = captures.get(1) {
            return Some(code.as_str().to_string());
        }
    }

    // 第三种方式
    let re3 = Regex::new(r"verification code is: (\d{6})").unwrap();
    if let Some(captures) = re3.captures(content) {
        if let Some(code) = captures.get(1) {
            return Some(code.as_str().to_string());
        }
    }

    // 第四种方式 - 更通用的6位数字匹配，排除颜色代码（如#414141）
    // 1. 移除颜色代码
    let color_code_regex = Regex::new(r"#([0-9a-fA-F]{6})\b").unwrap();
    let content_without_colors = color_code_regex.replace_all(content, "");

    // 2. 查找 6 位数字
    let re4 = Regex::new(r"\b(\d{6})\b").unwrap();
    if let Some(captures) = re4.captures(&content_without_colors) {
        if let Some(code) = captures.get(1) {
            return Some(code.as_str().to_string());
        }
    }

    None
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_available_backups() -> Result<Vec<BackupInfo>, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .find_backups()
        .map_err(|e| format!("Failed to find backups: {}", e))
}

#[tauri::command]
async fn extract_backup_ids(backup_path: String) -> Result<MachineIds, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .extract_ids_from_backup(&backup_path)
        .map_err(|e| format!("Failed to extract IDs from backup: {}", e))
}

#[tauri::command]
async fn delete_backup(backup_path: String) -> Result<serde_json::Value, String> {
    use std::fs;

    match fs::remove_file(&backup_path) {
        Ok(_) => {
            println!("✅ 成功删除备份文件: {}", backup_path);
            Ok(serde_json::json!({
                "success": true,
                "message": "备份文件删除成功"
            }))
        }
        Err(e) => {
            println!("❌ 删除备份文件失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("删除失败: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn restore_machine_ids(backup_path: String) -> Result<RestoreResult, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    let mut details = Vec::new();
    let mut success = true;

    // Extract IDs from backup
    let ids = match restorer.extract_ids_from_backup(&backup_path) {
        Ok(ids) => {
            details.push("Successfully extracted IDs from backup".to_string());
            ids
        }
        Err(e) => {
            return Ok(RestoreResult {
                success: false,
                message: format!("Failed to extract IDs from backup: {}", e),
                details,
            });
        }
    };

    // Create backup of current state
    match restorer.create_backup() {
        Ok(backup_path) => {
            details.push(format!("Created backup at: {}", backup_path));
        }
        Err(e) => {
            details.push(format!("Warning: Failed to create backup: {}", e));
        }
    }

    // Update storage file
    if let Err(e) = restorer.update_storage_file(&ids) {
        success = false;
        details.push(format!("Failed to update storage file: {}", e));
    } else {
        details.push("Successfully updated storage.json".to_string());
    }

    // Update SQLite database (simplified version)
    match restorer.update_sqlite_db(&ids) {
        Ok(sqlite_results) => {
            details.extend(sqlite_results);
        }
        Err(e) => {
            details.push(format!("Warning: Failed to update SQLite database: {}", e));
        }
    }

    // Update machine ID file
    if let Err(e) = restorer.update_machine_id_file(&ids.dev_device_id) {
        details.push(format!("Warning: Failed to update machine ID file: {}", e));
    } else {
        details.push("Successfully updated machine ID file".to_string());
    }

    // Update system IDs
    match restorer.update_system_ids(&ids) {
        Ok(system_results) => {
            details.extend(system_results);
        }
        Err(e) => {
            details.push(format!("Warning: Failed to update system IDs: {}", e));
        }
    }

    let message = if success {
        "Machine IDs restored successfully".to_string()
    } else {
        "Machine ID restoration completed with some errors".to_string()
    };

    Ok(RestoreResult {
        success,
        message,
        details,
    })
}

#[tauri::command]
async fn get_cursor_paths() -> Result<(String, String), String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    Ok((
        restorer.db_path.to_string_lossy().to_string(),
        restorer.sqlite_path.to_string_lossy().to_string(),
    ))
}

#[tauri::command]
async fn check_cursor_installation() -> Result<bool, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    Ok(restorer.db_path.exists() || restorer.sqlite_path.exists())
}

#[tauri::command]
async fn reset_machine_ids() -> Result<ResetResult, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .reset_machine_ids()
        .map_err(|e| format!("Failed to reset machine IDs: {}", e))
}

#[tauri::command]
async fn complete_cursor_reset() -> Result<ResetResult, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .complete_cursor_reset()
        .map_err(|e| format!("Failed to complete Cursor reset: {}", e))
}

#[tauri::command]
async fn get_current_machine_ids() -> Result<Option<MachineIds>, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .get_current_machine_ids()
        .map_err(|e| format!("Failed to get current machine IDs: {}", e))
}

#[tauri::command]
async fn get_machine_id_file_content() -> Result<Option<String>, String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .get_machine_id_file_content()
        .map_err(|e| format!("Failed to get machine ID file content: {}", e))
}

#[tauri::command]
async fn get_backup_directory_info() -> Result<(String, Vec<String>), String> {
    let restorer =
        MachineIdRestorer::new().map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer
        .get_backup_directory_info()
        .map_err(|e| format!("Failed to get backup directory info: {}", e))
}

#[tauri::command]
async fn check_user_authorization(token: String) -> Result<AuthCheckResult, String> {
    AuthChecker::check_user_authorized(&token)
        .await
        .map_err(|e| format!("Failed to check user authorization: {}", e))
}

#[tauri::command]
async fn get_token_auto() -> Result<TokenInfo, String> {
    Ok(AuthChecker::get_token_auto())
}

#[tauri::command]
async fn debug_cursor_paths() -> Result<Vec<String>, String> {
    AuthChecker::debug_cursor_paths().map_err(|e| format!("Failed to debug cursor paths: {}", e))
}

// Account Management Commands
#[tauri::command]
async fn get_account_list() -> Result<AccountListResult, String> {
    Ok(AccountManager::get_account_list())
}

#[tauri::command]
async fn add_account(
    email: String,
    token: String,
    refresh_token: Option<String>,
    workos_cursor_session_token: Option<String>,
) -> Result<serde_json::Value, String> {
    match AccountManager::add_account(
        email.clone(),
        token,
        refresh_token,
        workos_cursor_session_token,
    ) {
        Ok(()) => Ok(serde_json::json!({
            "success": true,
            "message": format!("Account {} added successfully", email)
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "message": format!("Failed to add account: {}", e)
        })),
    }
}

#[tauri::command]
async fn switch_account(email: String) -> Result<SwitchAccountResult, String> {
    Ok(AccountManager::switch_account(email))
}

#[tauri::command]
async fn switch_account_with_token(
    email: String,
    token: String,
    auth_type: Option<String>,
) -> Result<SwitchAccountResult, String> {
    Ok(AccountManager::switch_account_with_token(
        email, token, auth_type,
    ))
}

#[tauri::command]
async fn edit_account(
    email: String,
    new_token: Option<String>,
    new_refresh_token: Option<String>,
    new_workos_cursor_session_token: Option<String>,
) -> Result<serde_json::Value, String> {
    println!(
        "🔍 [DEBUG] edit_account called with email: {}, new_token: {:?}, new_refresh_token: {:?}, new_workos_cursor_session_token: {:?}",
        email,
        new_token
            .as_ref()
            .map(|t| format!("{}...", &t[..t.len().min(10)])),
        new_refresh_token
            .as_ref()
            .map(|t| format!("{}...", &t[..t.len().min(10)])),
        new_workos_cursor_session_token
            .as_ref()
            .map(|t| format!("{}...", &t[..t.len().min(10)]))
    );

    match AccountManager::edit_account(
        email.clone(),
        new_token,
        new_refresh_token,
        new_workos_cursor_session_token,
    ) {
        Ok(()) => {
            println!("✅ [DEBUG] Account {} updated successfully", email);
            Ok(serde_json::json!({
                "success": true,
                "message": format!("Account {} updated successfully", email)
            }))
        }
        Err(e) => {
            println!("❌ [DEBUG] Failed to update account {}: {}", email, e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("Failed to update account: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn remove_account(email: String) -> Result<serde_json::Value, String> {
    match AccountManager::remove_account(email.clone()) {
        Ok(()) => Ok(serde_json::json!({
            "success": true,
            "message": format!("Account {} removed successfully", email)
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "message": format!("Failed to remove account: {}", e)
        })),
    }
}

#[tauri::command]
async fn logout_current_account() -> Result<LogoutResult, String> {
    Ok(AccountManager::logout_current_account())
}

#[tauri::command]
async fn open_cancel_subscription_page(
    app: tauri::AppHandle,
    workos_cursor_session_token: String,
) -> Result<serde_json::Value, String> {
    println!("🔄 Opening cancel subscription page with WorkOS token...");

    let url = "https://cursor.com/";

    // 先尝试关闭已存在的窗口
    if let Some(existing_window) = app.get_webview_window("cancel_subscription") {
        println!("🔄 Closing existing cancel subscription window...");
        if let Err(e) = existing_window.close() {
            println!("❌ Failed to close existing window: {}", e);
        } else {
            println!("✅ Existing window closed successfully");
        }
        // 等待一小段时间确保窗口完全关闭
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // 创建新的 WebView 窗口（默认隐藏）
    let webview_window = tauri::WebviewWindowBuilder::new(
        &app,
        "cancel_subscription",
        tauri::WebviewUrl::External(url.parse().unwrap()),
    )
    .title("Cursor - 取消订阅")
    .inner_size(1200.0, 800.0)
    .resizable(true)
    .visible(true) // 默认隐藏窗口
    .build();

    match webview_window {
        Ok(window) => {
            // 等待页面加载完成后注入 cookie
            let token = workos_cursor_session_token.clone();
            let window_clone = window.clone();

            // 使用 tauri::async_runtime::spawn 来处理异步操作
            tauri::async_runtime::spawn(async move {
                // 等待一段时间让页面加载
                tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

                // 第一步：注入 cookie
                let cookie_script = format!(
                    r#"
                    document.cookie = 'WorkosCursorSessionToken={}; domain=.cursor.com; path=/; secure; samesite=none';
                    console.log('Cookie injected successfully');
                    "#,
                    token
                );

                if let Err(e) = window_clone.eval(&cookie_script) {
                    println!("❌ Failed to inject cookie: {}", e);
                    return;
                } else {
                    println!("✅ Cookie injected successfully");
                }

                // 第二步：跳转到billing页面
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                let navigation_script = r#"
                    console.log('Navigating to billing page...');
                    window.location.href = 'https://cursor.com/dashboard?tab=billing';
                "#;

                if let Err(e) = window_clone.eval(navigation_script) {
                    println!("❌ Failed to navigate: {}", e);
                    return;
                } else {
                    println!("✅ Navigation initiated");
                }
            });

            // 监听页面导航事件，在新页面加载后注入按钮点击脚本
            let window_for_button_click = window.clone();

            // 使用另一个异步任务来处理按钮点击
            tauri::async_runtime::spawn(async move {
                // 等待页面跳转和加载
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

                // 首先检查当前页面URL是否正确
                let url_check_script = r#"
                    console.log('Current URL:', window.location.href);
                    if (!window.location.href.includes('cursor.com/dashboard')) {
                        console.log('Not on dashboard page, navigating...');
                        window.location.href = 'https://cursor.com/dashboard?tab=billing';
                        false; // 表示需要重新导航
                    } else {
                        console.log('Already on dashboard page');
                        true; // 表示可以继续查找按钮
                    }
                "#;

                // 检查页面URL
                match window_for_button_click.eval(url_check_script) {
                    Ok(_) => {
                        // 等待一段时间让页面稳定
                        tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                    }
                    Err(e) => {
                        println!("❌ Failed to check URL: {}", e);
                        return;
                    }
                }

                // 注入查找并点击按钮的脚本
                let button_click_script = r#"
                    console.log('Looking for cancel subscription button...');

                    function findAndClickCancelButton() {
                        console.log('Current page URL:', window.location.href);
                        console.log('Page title:', document.title);

                        // 确保我们在正确的页面上
                        if (!window.location.href.includes('cursor.com/dashboard')) {
                            console.log('Not on dashboard page, redirecting...');
                            window.location.href = 'https://cursor.com/dashboard?tab=billing';
                            return false;
                        }

                        // 等待页面元素加载
                        if (document.readyState !== 'complete') {
                            console.log('Page not fully loaded, waiting...');
                            return false;
                        }

                        // 查找具有指定类名的按钮
                        const buttons = document.querySelectorAll('button.dashboard-outline-button.dashboard-outline-button-medium');
                        console.log('Found buttons with target classes:', buttons.length);

                        // 打印所有按钮的文本内容用于调试
                        buttons.forEach((btn, index) => {
                            console.log(`Button ${index}: "${btn.textContent?.trim()}"`);
                        });

                        for (let button of buttons) {
                            const buttonText = button.textContent?.trim() || '';
                            console.log('Checking button text:', buttonText);

                            // 查找包含取消订阅相关文本的按钮
                            if (buttonText && (
                                buttonText.toLowerCase().includes('cancel') ||
                                buttonText.toLowerCase().includes('unsubscribe') ||
                                buttonText.toLowerCase().includes('manage subscription') ||
                                buttonText.toLowerCase().includes('manage') ||
                                buttonText.toLowerCase().includes('subscription') ||
                                buttonText.includes('取消') ||
                                buttonText.includes('订阅')
                            )) {
                                console.log('Found potential cancel subscription button:', buttonText);
                                button.click();
                                console.log('Button clicked');

                                // 等待一段时间后再次点击确保操作生效
                                setTimeout(() => {
                                    button.click();
                                    console.log('Button clicked again');
                                     window.__TAURI_INTERNALS__.invoke('show_cancel_subscription_window');
                                    // 通知 Rust 端显示窗口
                                    setTimeout(() => {
                                        button.click();
                                        window.__TAURI_INTERNALS__.invoke('show_cancel_subscription_window');
                                        console.log('Notified Rust to show window');
                                    }, 500);
                                }, 500);
                                return true;
                            }
                        }

                        // 如果没找到，尝试查找所有相关按钮
                        console.log('No buttons found with specified classes, searching all buttons...');
                        const allButtons = document.querySelectorAll('button');
                        console.log('Total buttons found:', allButtons.length);

                        for (let button of allButtons) {
                            const buttonText = button.textContent?.trim() || '';
                            if (buttonText && (
                                buttonText.toLowerCase().includes('cancel') ||
                                buttonText.toLowerCase().includes('unsubscribe') ||
                                buttonText.toLowerCase().includes('manage subscription') ||
                                buttonText.toLowerCase().includes('manage') ||
                                buttonText.toLowerCase().includes('subscription') ||
                                buttonText.includes('取消') ||
                                buttonText.includes('订阅')
                            )) {
                                console.log('Found cancel button in all buttons:', buttonText);
                                button.click();
                                console.log('All buttons search - button clicked');

                                // 通知 Rust 端显示窗口
                                setTimeout(() => {
                                    window.__TAURI_INTERNALS__.invoke('show_cancel_subscription_window');
                                    console.log('All buttons search - notified Rust to show window');
                                }, 500);
                                return true;
                            }
                        }

                        return false;
                    }

                    // 智能等待并查找按钮
                    function waitAndFindButton(maxAttempts = 15) {
                        let attempts = 0;

                        function tryFind() {
                            attempts++;
                            console.log(`Searching for button, attempt ${attempts}/${maxAttempts}`);

                            if (findAndClickCancelButton()) {
                                console.log('Button found and clicked successfully!');
                                return;
                            }

                            if (attempts < maxAttempts) {
                                setTimeout(tryFind, 1000); // 每1000ms尝试一次
                            } else {
                                console.log('Max attempts reached, button not found');
                                // 通知 Rust 端操作失败
                                window.__TAURI_INTERNALS__.invoke('cancel_subscription_failed');
                            }
                        }

                        tryFind();
                    }

                    // 开始查找按钮
                    waitAndFindButton();
                "#;

                if let Err(e) = window_for_button_click.eval(button_click_script) {
                    println!("❌ Failed to inject button click script: {}", e);
                } else {
                    println!("✅ Button click script injected successfully");
                }
            });

            println!("✅ Successfully opened WebView window");
            Ok(serde_json::json!({
                "success": true,
                "message": "已打开取消订阅页面，正在自动登录..."
            }))
        }
        Err(e) => {
            println!("❌ Failed to create WebView window: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("无法打开内置浏览器: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn show_cancel_subscription_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("cancel_subscription") {
        // 延迟1500ms再显示窗口
        tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;

        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        println!("✅ Cancel subscription window shown");

        // 发送事件通知前端操作成功
        if let Err(e) = app.emit("cancel-subscription-success", ()) {
            println!("❌ Failed to emit success event: {}", e);
        }
    }
    Ok(())
}

#[tauri::command]
async fn cancel_subscription_failed(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("cancel_subscription") {
        window
            .close()
            .map_err(|e| format!("Failed to close window: {}", e))?;
        println!("❌ Cancel subscription failed, window closed");

        // 发送事件通知前端操作失败
        if let Err(e) = app.emit("cancel-subscription-failed", ()) {
            println!("❌ Failed to emit failed event: {}", e);
        }
    }
    Ok(())
}

#[tauri::command]
async fn delete_cursor_account(
    workos_cursor_session_token: String,
) -> Result<serde_json::Value, String> {
    use reqwest::header::{HeaderMap, HeaderValue};

    println!("🔄 开始调用 Cursor 删除账户 API...");

    // 构建请求头
    let mut headers = HeaderMap::new();
    headers.insert("Accept", HeaderValue::from_static("*/*"));
    headers.insert(
        "Accept-Encoding",
        HeaderValue::from_static("gzip, deflate, br, zstd"),
    );
    headers.insert(
        "Accept-Language",
        HeaderValue::from_static("en,zh-CN;q=0.9,zh;q=0.8,eu;q=0.7"),
    );
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert("Content-Length", HeaderValue::from_static("2"));
    headers.insert("Origin", HeaderValue::from_static("https://cursor.com"));
    headers.insert(
        "Referer",
        HeaderValue::from_static("https://cursor.com/cn/dashboard?tab=settings"),
    );
    headers.insert(
        "Sec-CH-UA",
        HeaderValue::from_static(
            "\"Not;A=Brand\";v=\"99\", \"Google Chrome\";v=\"139\", \"Chromium\";v=\"139\"",
        ),
    );
    headers.insert("Sec-CH-UA-Arch", HeaderValue::from_static("\"x86\""));
    headers.insert("Sec-CH-UA-Bitness", HeaderValue::from_static("\"64\""));
    headers.insert("Sec-CH-UA-Mobile", HeaderValue::from_static("?0"));
    headers.insert("Sec-CH-UA-Platform", HeaderValue::from_static("\"macOS\""));
    headers.insert(
        "Sec-CH-UA-Platform-Version",
        HeaderValue::from_static("\"15.3.1\""),
    );
    headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
    headers.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
    headers.insert("Sec-Fetch-Site", HeaderValue::from_static("same-origin"));
    headers.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"));

    // 使用传入的 WorkosCursorSessionToken
    let cookie_value = format!("WorkosCursorSessionToken={}", workos_cursor_session_token);
    println!(
        "🔍 [DEBUG] Using WorkosCursorSessionToken: {}...",
        &workos_cursor_session_token[..workos_cursor_session_token.len().min(50)]
    );
    headers.insert(
        "Cookie",
        HeaderValue::from_str(&cookie_value).map_err(|e| format!("Invalid cookie value: {}", e))?,
    );

    // 创建 HTTP 客户端
    let client = reqwest::Client::new();

    // 发送请求
    match client
        .post("https://cursor.com/api/dashboard/delete-account")
        .headers(headers)
        .body("{}")
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let headers_map: std::collections::HashMap<String, String> = response
                .headers()
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();

            println!("📥 API 响应状态: {}", status);
            println!("📥 响应头: {:?}", headers_map);

            match response.text().await {
                Ok(body) => {
                    println!("📥 响应体: {}", body);

                    Ok(serde_json::json!({
                        "success": status.is_success(),
                        "status": status.as_u16(),
                        "message": if status.is_success() {
                            format!("✅ 删除账户请求成功！状态码: {}, 响应: {}", status, body)
                        } else {
                            format!("❌ 删除账户失败！状态码: {}, 响应: {}", status, body)
                        },
                        "response_body": body,
                        "response_headers": headers_map
                    }))
                }
                Err(e) => {
                    println!("❌ 读取响应体失败: {}", e);
                    Ok(serde_json::json!({
                        "success": false,
                        "status": status.as_u16(),
                        "message": format!("❌ 读取响应失败: {}", e),
                        "response_headers": headers_map
                    }))
                }
            }
        }
        Err(e) => {
            println!("❌ 网络请求失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("❌ 网络请求失败: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn trigger_authorization_login(
    uuid: String,
    challenge: String,
    workos_cursor_session_token: String,
) -> Result<serde_json::Value, String> {
    use reqwest::header::{HeaderMap, HeaderValue};

    println!("🔄 开始调用 Cursor 授权登录 API...");
    println!("🔍 [DEBUG] UUID: {}", uuid);
    println!("🔍 [DEBUG] Challenge: {}", challenge);

    // 构建请求头
    let mut headers = HeaderMap::new();
    // headers.insert("Accept", HeaderValue::from_static("*/*"));
    // headers.insert(
    //     "Accept-Encoding",
    //     HeaderValue::from_static("gzip, deflate, br, zstd"),
    // );
    // headers.insert(
    //     "Accept-Language",
    //     HeaderValue::from_static("en,zh-CN;q=0.9,zh;q=0.8,eu;q=0.7"),
    // );
    // headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    // headers.insert("Content-Length", HeaderValue::from_static("2"));
    // headers.insert("Origin", HeaderValue::from_static("https://cursor.com"));
    // headers.insert(
    //     "Referer",
    //     HeaderValue::from_str(&format!(
    //         "https://cursor.com/cn/loginDeepControl?challenge={}&uuid={}&mode=login",
    //         challenge, uuid
    //     ))
    //     .map_err(|e| format!("Invalid Referer header value: {}", e))?,
    // );
    // headers.insert(
    //     "Sec-CH-UA",
    //     HeaderValue::from_static(
    //         "\"Not;A=Brand\";v=\"99\", \"Google Chrome\";v=\"139\", \"Chromium\";v=\"139\"",
    //     ),
    // );
    // headers.insert("Sec-CH-UA-Arch", HeaderValue::from_static("\"x86\""));
    // headers.insert("Sec-CH-UA-Bitness", HeaderValue::from_static("\"64\""));
    // headers.insert("Sec-CH-UA-Mobile", HeaderValue::from_static("?0"));
    // headers.insert("Sec-CH-UA-Platform", HeaderValue::from_static("\"macOS\""));
    // headers.insert(
    //     "Sec-CH-UA-Platform-Version",
    //     HeaderValue::from_static("\"15.3.1\""),
    // );
    // headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
    // headers.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
    // headers.insert("Sec-Fetch-Site", HeaderValue::from_static("same-origin"));
    // headers.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"));

    // 使用传入的 WorkosCursorSessionToken
    let cookie_value = format!("WorkosCursorSessionToken={}", workos_cursor_session_token);
    println!(
        "🔍 [DEBUG] Using WorkosCursorSessionToken: {}...",
        &workos_cursor_session_token[..workos_cursor_session_token.len().min(50)]
    );
    headers.insert(
        "Cookie",
        HeaderValue::from_str(&cookie_value).map_err(|e| format!("Invalid cookie value: {}", e))?,
    );

    // 创建 HTTP 客户端
    let client = reqwest::Client::new();

    let payload = serde_json::json!({
        "challenge": challenge,
        "uuid": uuid,
    });

    // 发送请求
    match client
        .post("https://cursor.com/api/auth/loginDeepCallbackControl")
        .headers(headers)
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let headers_map: std::collections::HashMap<String, String> = response
                .headers()
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();

            println!("📥 API 响应状态: {}", status);
            println!("📥 响应头: {:?}", headers_map);

            match response.text().await {
                Ok(body) => {
                    println!("📥 响应体: {}", body);

                    Ok(serde_json::json!({
                        "success": status.is_success(),
                        "status": status.as_u16(),
                        "message": if status.is_success() {
                            format!("✅ 授权登录请求成功！状态码: {}, 响应: {}", status, body)
                        } else {
                            format!("❌ 授权登录失败！状态码: {}, 响应: {}", status, body)
                        },
                        "response_body": body,
                        "response_headers": headers_map
                    }))
                }
                Err(e) => {
                    println!("❌ 读取响应体失败: {}", e);
                    Ok(serde_json::json!({
                        "success": false,
                        "status": status.as_u16(),
                        "message": format!("❌ 读取授权登录响应失败: {}", e),
                        "response_headers": headers_map
                    }))
                }
            }
        }
        Err(e) => {
            println!("❌ 网络请求授权登录失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("❌ 网络请求授权登录失败: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn trigger_authorization_login_poll(
    uuid: String,
    verifier: String,
) -> Result<serde_json::Value, String> {
    use reqwest::header::{HeaderMap, HeaderValue};

    println!("🔄 开始调用 Cursor 授权登录 Poll API...");
    println!("🔍 [DEBUG] UUID: {}", uuid);
    println!("🔍 [DEBUG] verifier: {}", verifier);

    // 构建请求头
    let mut headers = HeaderMap::new();
    headers.insert("Accept", HeaderValue::from_static("*/*"));
    headers.insert(
        "Accept-Encoding",
        HeaderValue::from_static("gzip, deflate, br, zstd"),
    );
    headers.insert(
        "Accept-Language",
        HeaderValue::from_static("en,zh-CN;q=0.9,zh;q=0.8,eu;q=0.7"),
    );
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert("Content-Length", HeaderValue::from_static("2"));
    headers.insert("Origin", HeaderValue::from_static("https://cursor.com"));
    headers.insert(
        "Sec-CH-UA",
        HeaderValue::from_static(
            "\"Not;A=Brand\";v=\"99\", \"Google Chrome\";v=\"139\", \"Chromium\";v=\"139\"",
        ),
    );
    headers.insert("Sec-CH-UA-Arch", HeaderValue::from_static("\"x86\""));
    headers.insert("Sec-CH-UA-Bitness", HeaderValue::from_static("\"64\""));
    headers.insert("Sec-CH-UA-Mobile", HeaderValue::from_static("?0"));
    headers.insert("Sec-CH-UA-Platform", HeaderValue::from_static("\"macOS\""));
    headers.insert(
        "Sec-CH-UA-Platform-Version",
        HeaderValue::from_static("\"15.3.1\""),
    );
    headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
    headers.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
    headers.insert("Sec-Fetch-Site", HeaderValue::from_static("same-origin"));
    headers.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"));

    // 创建 HTTP 客户端
    let client = reqwest::Client::new();

    // 发送请求
    match client
        .get(&format!(
            "https://api2.cursor.sh/auth/poll?uuid={}&verifier={}",
            uuid, verifier
        ))
        .headers(headers)
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let headers_map: std::collections::HashMap<String, String> = response
                .headers()
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();

            println!("📥 API 响应状态: {}", status);
            println!("📥 响应头: {:?}", headers_map);

            match response.text().await {
                Ok(body) => {
                    println!("📥 响应体: {}", body);

                    Ok(serde_json::json!({
                        "success": status.is_success(),
                        "status": status.as_u16(),
                        "message": if status.is_success() {
                            format!("✅ 授权登录Poll请求成功！状态码: {}, 响应: {}", status, body)
                        } else {
                            format!("❌ 授权登录Poll失败！状态码: {}, 响应: {}", status, body)
                        },
                        "response_body": body,
                        "response_headers": headers_map
                    }))
                }
                Err(e) => {
                    println!("❌ 读取响应体失败: {}", e);
                    Ok(serde_json::json!({
                        "success": false,
                        "status": status.as_u16(),
                        "message": format!("❌ 读取授权登录Poll响应失败: {}", e),
                        "response_headers": headers_map
                    }))
                }
            }
        }
        Err(e) => {
            println!("❌ 网络请求授权登录Poll失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("❌ 网络请求授权登录Poll失败: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn get_usage_for_period(
    token: String,
    start_date: u64,
    end_date: u64,
    team_id: i32,
) -> Result<serde_json::Value, String> {
    println!(
        "🔍 获取用量数据请求: token长度={}, start_date={}, end_date={}, team_id={}",
        token.len(),
        start_date,
        end_date,
        team_id
    );

    match AuthChecker::get_usage_for_period(&token, start_date, end_date, team_id).await {
        Ok(Some(usage_data)) => {
            println!("✅ 成功获取用量数据");
            Ok(serde_json::json!({
                "success": true,
                "message": "Successfully retrieved usage data",
                "data": usage_data
            }))
        }
        Ok(None) => {
            println!("⚠️ 未找到用量数据");
            Ok(serde_json::json!({
                "success": false,
                "message": "No usage data found"
            }))
        }
        Err(e) => {
            println!("❌ 获取用量数据失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("Failed to get usage data: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn get_user_analytics(
    token: String,
    team_id: i32,
    user_id: i32,
    start_date: String,
    end_date: String,
) -> Result<serde_json::Value, String> {
    println!(
        "🔍 获取用户分析数据 - team_id: {}, user_id: {}, 时间范围: {} 到 {}",
        team_id, user_id, start_date, end_date
    );

    match AuthChecker::get_user_analytics(&token, team_id, user_id, &start_date, &end_date).await {
        Ok(Some(analytics_data)) => {
            println!("✅ 成功获取用户分析数据");
            Ok(serde_json::json!({
                "success": true,
                "message": "Successfully retrieved user analytics data",
                "data": analytics_data
            }))
        }
        Ok(None) => {
            println!("⚠️ 未找到用户分析数据");
            Ok(serde_json::json!({
                "success": false,
                "message": "No user analytics data found"
            }))
        }
        Err(e) => {
            println!("❌ 获取用户分析数据失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("Failed to get user analytics data: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn get_usage_events(
    token: String,
    team_id: i32,
    start_date: String,
    end_date: String,
    page: i32,
    page_size: i32,
) -> Result<serde_json::Value, String> {
    println!(
        "🔍 获取使用事件数据 - team_id: {}, 时间范围: {} 到 {}, 页码: {}, 页大小: {}",
        team_id, start_date, end_date, page, page_size
    );

    match AuthChecker::get_usage_events(&token, team_id, &start_date, &end_date, page, page_size)
        .await
    {
        Ok(Some(events_data)) => {
            println!("✅ 成功获取使用事件数据");
            Ok(serde_json::json!({
                "success": true,
                "message": "Successfully retrieved usage events data",
                "data": events_data
            }))
        }
        Ok(None) => {
            println!("⚠️ 未找到使用事件数据");
            Ok(serde_json::json!({
                "success": false,
                "message": "No usage events data found"
            }))
        }
        Err(e) => {
            println!("❌ 获取使用事件数据失败: {}", e);
            Ok(serde_json::json!({
                "success": false,
                "message": format!("Failed to get usage events data: {}", e)
            }))
        }
    }
}

#[tauri::command]
async fn register_cursor_account(
    first_name: String,
    last_name: String,
) -> Result<serde_json::Value, String> {
    println!("🔄 开始注册 Cursor 账户...");
    println!("👤 姓名: {} {}", first_name, last_name);

    // 获取可执行文件路径
    let executable_path = get_python_executable_path()?;

    if !executable_path.exists() {
        return Err(format!("找不到Python可执行文件: {:?}", executable_path));
    }

    println!("🐍 调用Python可执行文件: {:?}", executable_path);

    // 生成随机邮箱
    let random_email = format!(
        "{}{}{}@gmail.com",
        first_name.to_lowercase(),
        last_name.to_lowercase(),
        rand::random::<u32>() % 1000
    );

    // 执行Python可执行文件
    let output = Command::new(&executable_path)
        .arg(&random_email)
        .arg(&first_name)
        .arg(&last_name)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动Python脚本: {}", e))?
        .wait_with_output()
        .map_err(|e| format!("等待Python脚本执行失败: {}", e))?;

    // 处理输出
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("❌ Python脚本执行失败: {}", stderr);
        return Err(format!("注册失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    println!("📝 Python脚本输出: {}", stdout);

    // 解析JSON响应
    let result: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("解析注册结果失败: {}", e))?;

    if result["success"].as_bool().unwrap_or(false) {
        // 注册成功，保存账户信息
        if let Some(email) = result["email"].as_str() {
            match AccountManager::add_account(
                email.to_string(),
                "python_registered_token".to_string(), // 临时token
                None,
                None,
            ) {
                Ok(_) => println!("💾 账户信息已保存"),
                Err(e) => println!("⚠️ 保存账户信息失败: {}", e),
            }
        }

        println!("✅ 注册成功!");
        Ok(result)
    } else {
        let error_msg = result["error"].as_str().unwrap_or("未知错误");
        println!("❌ 泣册失败: {}", error_msg);
        Err(error_msg.to_string())
    }
}

#[tauri::command]
async fn create_temp_email() -> Result<serde_json::Value, String> {
    println!("📧 测试Python可执行文件...");

    // 获取可执行文件路径
    let executable_path = get_python_executable_path()?;

    if !executable_path.exists() {
        return Err(format!("找不到Python可执行文件: {:?}", executable_path));
    }

    // 执行Python可执行文件测试（传递一个测试邮箱）
    let output = Command::new(&executable_path)
        .arg("test@example.com")
        .arg("Test")
        .arg("User")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动Python脚本: {}", e))?
        .wait_with_output()
        .map_err(|e| format!("等待Python脚本执行失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("创建邮箱失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("解析邮箱结果失败: {}", e))?;

    Ok(result)
}

#[tauri::command]
async fn register_with_email(
    app: tauri::AppHandle,
    email: String,
    first_name: String,
    last_name: String,
    use_incognito: Option<bool>,
) -> Result<serde_json::Value, String> {
    println!("🔄 使用指定邮箱注册 Cursor 账户...");
    println!("📧 邮箱: {}", email);
    println!("👤 姓名: {} {}", first_name, last_name);

    // 获取可执行文件路径
    let executable_path = get_python_executable_path()?;

    if !executable_path.exists() {
        return Err(format!("找不到Python可执行文件: {:?}", executable_path));
    }

    // 执行Python可执行文件
    let incognito_flag = if use_incognito.unwrap_or(true) {
        "true"
    } else {
        "false"
    };
    let mut child = Command::new(&executable_path)
        .arg(&email)
        .arg(&first_name)
        .arg(&last_name)
        .arg(incognito_flag)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动Python脚本: {}", e))?;

    // 实时读取输出
    use std::io::{BufRead, BufReader};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    let stdout = child.stdout.take().ok_or("无法获取stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取stderr")?;

    let output_lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let error_lines = Arc::new(Mutex::new(Vec::<String>::new()));

    let output_lines_clone = output_lines.clone();
    let error_lines_clone = error_lines.clone();
    let app_clone = app.clone();

    // 启动线程读取stdout
    let stdout_thread = thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                println!("Python输出: {}", line);

                // 发送实时输出事件到前端
                if let Err(e) = app_clone.emit(
                    "registration-output",
                    serde_json::json!({
                        "type": "stdout",
                        "line": line.clone()
                    }),
                ) {
                    println!("发送事件失败: {}", e);
                } else {
                    let truncated = line.chars().take(50).collect::<String>();
                    println!("✅ 事件已发送: {}", truncated);
                }

                // 检查是否需要验证码
                if line.contains("等待前端输入验证码") || line.contains("request_verification_code")
                {
                    let _ = app_clone.emit(
                        "verification-code-required",
                        serde_json::json!({
                            "message": "请输入验证码"
                        }),
                    );
                }

                if let Ok(mut lines) = output_lines_clone.lock() {
                    lines.push(line);
                }
            }
        }
    });

    // 启动线程读取stderr
    let app_clone2 = app.clone();
    let stderr_thread = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                println!("Python错误: {}", line);

                // 发送错误输出事件到前端
                let _ = app_clone2.emit(
                    "registration-output",
                    serde_json::json!({
                        "type": "stderr",
                        "line": line.clone()
                    }),
                );

                if let Ok(mut lines) = error_lines_clone.lock() {
                    lines.push(line);
                }
            }
        }
    });

    // 等待一段时间或者进程结束
    let start_time = Instant::now();
    let max_wait_time = Duration::from_secs(150); // 给足够时间输入验证码

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                // 进程已结束
                break;
            }
            Ok(None) => {
                // 进程仍在运行
                if start_time.elapsed() > max_wait_time {
                    // 超时，终止进程
                    let _ = child.kill();
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                return Err(format!("检查进程状态失败: {}", e));
            }
        }
    }

    // 等待读取线程完成
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    // 获取最终输出
    let final_output_lines = output_lines.lock().unwrap().clone();
    let final_error_lines = error_lines.lock().unwrap().clone();

    println!("收集到 {} 行输出", final_output_lines.len());
    println!("收集到 {} 行错误", final_error_lines.len());

    // 构建输出字符串
    let stdout_str = final_output_lines.join("\n");
    let stderr_str = final_error_lines.join("\n");

    // 尝试解析最后一行的JSON输出
    let mut result: serde_json::Value = serde_json::json!({
        "success": false,
        "error": "未找到有效的JSON输出",
        "output_lines": final_output_lines,
        "raw_output": stdout_str
    });

    // 从后往前查找有效的JSON
    for line in final_output_lines.iter().rev() {
        if line.trim().starts_with('{') {
            match serde_json::from_str::<serde_json::Value>(line.trim()) {
                Ok(mut parsed) => {
                    // 将输出信息添加到结果中
                    parsed["output_lines"] = serde_json::json!(final_output_lines);
                    parsed["raw_output"] = serde_json::json!(stdout_str);
                    if !stderr_str.is_empty() {
                        parsed["error_output"] = serde_json::json!(stderr_str);
                    }
                    result = parsed;
                    break;
                }
                Err(_) => continue,
            }
        }
    }
    // 前端触发保存
    // if result["success"].as_bool().unwrap_or(false) {
    //     // 注册成功，保存账户信息
    //     let token = result["token"]
    //         .as_str()
    //         .unwrap_or("python_registered_token")
    //         .to_string();
    //     let workos_token = result["workos_cursor_session_token"]
    //         .as_str()
    //         .map(|s| s.to_string());

    //     println!("🔑 提取的token: {}", token);
    //     if let Some(ref workos) = workos_token {
    //         println!(
    //             "🔐 WorkosCursorSessionToken: {}...",
    //             &workos[..std::cmp::min(50, workos.len())]
    //         );
    //     }

    //     match AccountManager::add_account(
    //         email.clone(),
    //         token,
    //         None,         // refresh_token
    //         workos_token, // workos_cursor_session_token
    //     ) {
    //         Ok(_) => println!("💾 账户信息已保存"),
    //         Err(e) => println!("⚠️ 保存账户信息失败: {}", e),
    //     }
    // }

    Ok(result)
}

#[tauri::command]
async fn register_with_cloudflare_temp_email(
    app: tauri::AppHandle,
    first_name: String,
    last_name: String,
    use_incognito: Option<bool>,
) -> Result<serde_json::Value, String> {
    println!("🔄 使用Cloudflare临时邮箱注册 Cursor 账户...");
    println!("👤 姓名: {} {}", first_name, last_name);
    println!(
        "🔍 [DEBUG] 前端传递的 use_incognito 参数: {:?}",
        use_incognito
    );

    // 1. 创建临时邮箱
    let (jwt, email) = create_cloudflare_temp_email().await?;
    println!("📧 创建的临时邮箱: {}", email);

    // 2. 获取可执行文件路径
    let executable_path = get_python_executable_path()?;

    if !executable_path.exists() {
        return Err(format!("找不到Python可执行文件: {:?}", executable_path));
    }

    // 3. 启动注册进程并设置实时输出
    let incognito_flag = if use_incognito.unwrap_or(true) {
        "true"
    } else {
        "false"
    };

    // 调试日志
    println!("🔍 [DEBUG] Rust 启动Python脚本:");
    println!("  - 可执行文件: {:?}", executable_path);
    println!("  - 邮箱: {}", email);
    println!("  - 姓名: {} {}", first_name, last_name);
    println!("  - use_incognito 原始值: {:?}", use_incognito);
    println!("  - incognito_flag: {}", incognito_flag);
    println!(
        "  - 传递的参数: [{}, {}, {}, {}]",
        email, first_name, last_name, incognito_flag
    );

    let mut child = Command::new(&executable_path)
        .arg(&email)
        .arg(&first_name)
        .arg(&last_name)
        .arg(incognito_flag)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动Python脚本: {}", e))?;

    // 获取stdout用于实时读取
    let stdout = child.stdout.take().ok_or("无法获取Python脚本的stdout")?;

    // 启动实时输出读取任务
    let app_for_output = app.clone();
    let jwt_for_verification = jwt.clone();
    let app_for_verification = app.clone();

    // 使用Arc<AtomicBool>来跟踪是否需要获取验证码
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    };
    let verification_needed = Arc::new(AtomicBool::new(false));
    let verification_needed_clone = verification_needed.clone();

    // 启动实时输出读取任务（在单独线程中）
    let app_clone = app_for_output.clone();
    let verification_needed_clone = verification_needed_clone.clone();
    let jwt_clone = jwt_for_verification.clone();
    let app_verification_clone = app_for_verification.clone();

    let output_task = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};

        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            match line {
                Ok(line_content) => {
                    println!("📝 Python输出: {}", line_content);

                    // 检查是否需要验证码
                    if line_content.contains("等待验证码")
                        || line_content.contains("request_verification_code")
                    {
                        println!("🔍 检测到验证码请求，开始自动获取验证码...");
                        verification_needed_clone.store(true, Ordering::Relaxed);

                        // 启动验证码获取任务
                        let jwt_task = jwt_clone.clone();
                        let app_task = app_verification_clone.clone();
                        std::thread::spawn(move || {
                            // 使用tokio运行时
                            let rt = tokio::runtime::Runtime::new().unwrap();
                            rt.block_on(async {
                                // 等待一小段时间让邮件到达
                                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                                for attempt in 1..=10 {
                                    println!("🔍 第{}次尝试获取验证码...", attempt);

                                    match get_verification_code_from_cloudflare(&jwt_task).await {
                                        Ok(code) => {
                                            println!("🎯 自动获取到验证码: {}", code);

                                            // 将验证码写入临时文件
                                            let temp_dir = std::env::temp_dir();
                                            let code_file =
                                                temp_dir.join("cursor_verification_code.txt");

                                            if let Err(e) = std::fs::write(&code_file, &code) {
                                                println!("❌ 写入验证码文件失败: {}", e);
                                                return;
                                            }

                                            // 发送事件通知前端
                                            if let Err(e) = app_task
                                                .emit("verification-code-auto-filled", &code)
                                            {
                                                println!("❌ 发送验证码事件失败: {}", e);
                                            }

                                            println!("✅ 验证码已自动填入临时文件");
                                            return;
                                        }
                                        Err(e) => {
                                            println!("🔍 第{}次获取验证码失败: {}", attempt, e);
                                            if attempt < 10 {
                                                tokio::time::sleep(
                                                    tokio::time::Duration::from_secs(10),
                                                )
                                                .await;
                                            }
                                        }
                                    }
                                }

                                println!("❌ 自动获取验证码失败，已尝试10次");
                                if let Err(emit_err) =
                                    app_task.emit("verification-code-failed", "获取验证码失败")
                                {
                                    println!("❌ 发送失败事件失败: {}", emit_err);
                                }
                            });
                        });
                    }

                    // 发送实时输出到前端
                    if let Err(e) = app_clone.emit(
                        "registration-output",
                        serde_json::json!({
                            "line": line_content,
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        }),
                    ) {
                        println!("❌ 发送输出事件失败: {}", e);
                    }
                }
                Err(e) => {
                    println!("❌ 读取Python输出失败: {}", e);
                    break;
                }
            }
        }
    });

    // 验证码获取已集成到输出读取任务中

    // 4. 等待注册进程完成
    let exit_status = child
        .wait()
        .map_err(|e| format!("等待Python脚本执行失败: {}", e))?;

    println!("🔍 Python进程已结束");

    // 等待输出读取任务完成
    let _ = output_task.join();

    // 6. 处理进程退出状态
    if !exit_status.success() {
        println!("❌ Python脚本执行失败，退出码: {:?}", exit_status.code());
        return Err(format!(
            "Python脚本执行失败，退出码: {:?}",
            exit_status.code()
        ));
    }

    // 7. 由于我们已经通过实时输出获取了所有信息，这里需要从最后的输出中解析结果
    // 我们可以通过检查临时文件或其他方式来获取最终结果
    // 简化处理：返回一个成功的结果，具体的注册状态通过实时输出已经传递给前端
    let result = serde_json::json!({
        "success": true,
        "message": "注册流程已完成",
        "email": email,
        "email_type": "cloudflare_temp"
    });

    // 8. 邮箱信息已经在创建result时添加了，这里不需要重复添加

    // 9. 如果注册成功，保存账户信息-前端保存
    // if result["success"].as_bool().unwrap_or(false) {
    //     let token = result["token"]
    //         .as_str()
    //         .unwrap_or("python_registered_token")
    //         .to_string();
    //     let workos_token = result["workos_cursor_session_token"]
    //         .as_str()
    //         .map(|s| s.to_string());

    //     println!("🔑 提取的token: {}", token);
    //     if let Some(ref workos) = workos_token {
    //         println!(
    //             "🔐 WorkosCursorSessionToken: {}...",
    //             &workos[..std::cmp::min(50, workos.len())]
    //         );
    //     }

    //     match AccountManager::add_account(
    //         email.clone(),
    //         token,
    //         None,         // refresh_token
    //         workos_token, // workos_cursor_session_token
    //     ) {
    //         Ok(_) => println!("💾 账户信息已保存"),
    //         Err(e) => println!("⚠️ 保存账户信息失败: {}", e),
    //     }
    // }

    Ok(result)
}

// 使用Outlook邮箱注册账户
#[tauri::command]
async fn register_with_outlook(
    app: tauri::AppHandle,
    email: String,
    first_name: String,
    last_name: String,
    use_incognito: Option<bool>,
) -> Result<serde_json::Value, String> {
    println!("🔄 使用Outlook邮箱注册 Cursor 账户...");
    println!("📧 邮箱: {}", email);
    println!("👤 姓名: {} {}", first_name, last_name);
    println!(
        "🔍 [DEBUG] 前端传递的 use_incognito 参数: {:?}",
        use_incognito
    );

    // 获取可执行文件路径
    let executable_path = get_python_executable_path()?;

    if !executable_path.exists() {
        return Err(format!("找不到Python可执行文件: {:?}", executable_path));
    }

    // 启动注册进程并设置实时输出
    let incognito_flag = if use_incognito.unwrap_or(true) {
        "true"
    } else {
        "false"
    };

    println!("🔍 [DEBUG] 准备启动注册进程");
    println!("    可执行文件: {:?}", executable_path);
    println!("    邮箱: {}", email);
    println!("    姓名: {} {}", first_name, last_name);
    println!("    隐身模式: {}", incognito_flag);

    let mut cmd = Command::new(&executable_path);
    cmd.arg(&email)
        .arg(&first_name)
        .arg(&last_name)
        .arg(incognito_flag)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    println!("🔍 [DEBUG] 命令行: {:?}", cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("无法启动注册进程: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法获取stdout".to_string())?;

    let stderr = child.stderr.take().ok_or("无法获取stderr".to_string())?;

    // 启动实时输出读取任务（使用同步线程，与Cloudflare注册函数保持一致）
    let app_clone = app.clone();
    let email_clone = email.clone();

    // 处理stdout
    let app_for_stdout = app_clone.clone();
    let email_for_stdout = email_clone.clone();
    let stdout_task = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            match line {
                Ok(line_content) => {
                    println!("📝 Python输出: {}", line_content);

                    // 检查是否需要验证码
                    if line_content.contains("等待验证码")
                        || line_content.contains("request_verification_code")
                        || line_content.contains("需要邮箱验证码")
                        || line_content.contains("请输入验证码")
                    {
                        println!("🔍 检测到验证码请求，开始从Outlook获取验证码...");

                        // 启动验证码获取任务
                        let app_task = app_for_stdout.clone();
                        let email_task = email_for_stdout.clone();
                        std::thread::spawn(move || {
                            // 使用tokio运行时
                            let rt = tokio::runtime::Runtime::new().unwrap();
                            rt.block_on(async {
                                // 等待一小段时间让邮件到达
                                tokio::time::sleep(tokio::time::Duration::from_secs(8)).await;

                                for attempt in 1..=10 {
                                    println!("🔍 第{}次尝试获取Outlook验证码...", attempt);

                                    match get_verification_code_from_outlook(&email_task).await {
                                        Ok(code) => {
                                            println!("🎯 自动获取到验证码: {}", code);

                                            // 将验证码写入临时文件
                                            let temp_dir = std::env::temp_dir();
                                            let code_file =
                                                temp_dir.join("cursor_verification_code.txt");

                                            if let Err(e) = std::fs::write(&code_file, &code) {
                                                println!("❌ 写入验证码文件失败: {}", e);
                                                return;
                                            }

                                            // 发送验证码到前端
                                            if let Err(e) =
                                                app_task.emit("verification-code-received", &code)
                                            {
                                                println!("❌ 发送验证码事件失败: {}", e);
                                            }

                                            println!("✅ 验证码已自动填入临时文件");
                                            return;
                                        }
                                        Err(e) => {
                                            println!("🔍 第{}次获取验证码失败: {}", attempt, e);
                                            if attempt < 10 {
                                                std::thread::sleep(std::time::Duration::from_secs(
                                                    10,
                                                ));
                                            }
                                        }
                                    }
                                }

                                println!("❌ 自动获取验证码失败，已尝试10次，请用户手动输入");
                                if let Err(emit_err) = app_task.emit(
                                    "verification-code-manual-input-required",
                                    "自动获取验证码失败，请手动输入验证码",
                                ) {
                                    println!("❌ 发送手动输入提示事件失败: {}", emit_err);
                                }
                            });
                        });
                    }

                    // 发送实时输出到前端
                    if let Err(e) = app_for_stdout.emit(
                        "registration-output",
                        serde_json::json!({
                            "line": line_content,
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        }),
                    ) {
                        println!("❌ 发送输出事件失败: {}", e);
                    }
                }
                Err(e) => {
                    println!("❌ 读取Python输出失败: {}", e);
                    break;
                }
            }
        }
    });

    // 处理stderr
    let app_for_stderr = app.clone();
    let stderr_task = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stderr);

        for line in reader.lines() {
            match line {
                Ok(line_content) => {
                    println!("📝 Python错误: {}", line_content);

                    // 发送错误输出到前端
                    if let Err(e) = app_for_stderr.emit(
                        "registration-output",
                        serde_json::json!({
                            "line": line_content,
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        }),
                    ) {
                        println!("❌ 发送错误输出事件失败: {}", e);
                    }
                }
                Err(e) => {
                    println!("❌ 读取Python错误输出失败: {}", e);
                    break;
                }
            }
        }
    });

    // // 等待进程完成
    // let exit_status = child
    //     .wait()
    //     .map_err(|e| format!("等待注册进程完成失败: {}", e))?;

    // println!("🔍 Python进程已结束");

    // // 等待输出读取任务完成
    // let _ = stdout_task.join();
    // let _ = stderr_task.join();

    // println!("🔍 [DEBUG] 注册完成");
    // println!("    退出代码: {:?}", exit_status.code());

    // // 构建返回结果
    // let result = if exit_status.success() {
    //     serde_json::json!({
    //         "success": false,
    //         "message": "进程关闭"
    //     })
    // } else {
    //     serde_json::json!({
    //         "success": false,
    //         "message": "进程关闭",
    //         "exit_code": exit_status.code()
    //     })
    // };

    // 4. 等待注册进程完成
    let exit_status = child
        .wait()
        .map_err(|e| format!("等待Python脚本执行失败: {}", e))?;

    println!("🔍 Python进程已结束");

    // 等待输出读取任务完成
    let _ = stdout_task.join();

    // 6. 处理进程退出状态
    if !exit_status.success() {
        println!("❌ Python脚本执行失败，退出码: {:?}", exit_status.code());
        return Err(format!(
            "Python脚本执行失败，退出码: {:?}",
            exit_status.code()
        ));
    }

    // 7. 由于我们已经通过实时输出获取了所有信息，这里需要从最后的输出中解析结果
    // 我们可以通过检查临时文件或其他方式来获取最终结果
    // 简化处理：返回一个成功的结果，具体的注册状态通过实时输出已经传递给前端
    let result = serde_json::json!({
        "success": false,
        "message": "注册进程已退出",
        "email": email,
        "email_type": "outlook-default"
    });

    Ok(result)
}

#[tauri::command]
async fn submit_verification_code(code: String) -> Result<serde_json::Value, String> {
    println!("🔢 接收到验证码: {}", code);

    // 验证验证码格式
    if !code.chars().all(|c| c.is_ascii_digit()) || code.len() != 6 {
        return Err("验证码必须是6位数字".to_string());
    }

    // 将验证码写入临时文件，供Python脚本读取
    let temp_dir = std::env::temp_dir();
    let code_file = temp_dir.join("cursor_verification_code.txt");

    println!("📁 临时目录: {:?}", temp_dir);
    println!("📄 验证码文件: {:?}", code_file);

    match std::fs::write(&code_file, &code) {
        Ok(_) => {
            println!("✅ 验证码已保存到临时文件: {:?}", code_file);
            Ok(serde_json::json!({
                "success": true,
                "message": "验证码已提交"
            }))
        }
        Err(e) => Err(format!("保存验证码失败: {}", e)),
    }
}

#[tauri::command]
async fn cancel_registration() -> Result<String, String> {
    use std::fs;

    // 创建取消文件
    let temp_dir = std::env::temp_dir();
    let cancel_file = temp_dir.join("cursor_registration_cancel.txt");

    println!("📁 临时目录: {:?}", temp_dir);
    println!("🚫 取消文件: {:?}", cancel_file);

    match fs::write(&cancel_file, "cancel") {
        Ok(_) => {
            println!("🚫 注册取消请求已发送到: {:?}", cancel_file);
            Ok("注册已取消".to_string())
        }
        Err(e) => Err(format!("发送取消请求失败: {}", e)),
    }
}

#[tauri::command]
async fn get_saved_accounts() -> Result<Vec<serde_json::Value>, String> {
    // 获取已保存的账户列表功能暂时不可用
    match AccountManager::load_accounts() {
        Ok(accounts) => {
            // 将AccountInfo转换为serde_json::Value
            let json_accounts: Vec<serde_json::Value> = accounts
                .into_iter()
                .map(|account| serde_json::to_value(account).unwrap_or(serde_json::Value::Null))
                .collect();
            Ok(json_accounts)
        }
        Err(e) => Err(format!("获取保存的账户失败: {}", e)),
    }
}

// Bank Card Configuration Commands
#[tauri::command]
async fn read_bank_card_config() -> Result<String, String> {
    use std::fs;

    // 获取工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    let config_path = current_dir.join("bank_card_config.json");

    if config_path.exists() {
        fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read bank card config: {}", e))
    } else {
        // 如果文件不存在，返回空字符串，前端会使用默认配置
        Ok(String::new())
    }
}

#[tauri::command]
async fn save_bank_card_config(config: String) -> Result<(), String> {
    use std::fs;

    // 获取工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    let config_path = current_dir.join("bank_card_config.json");

    // 验证JSON格式
    serde_json::from_str::<serde_json::Value>(&config)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;

    fs::write(&config_path, config)
        .map_err(|e| format!("Failed to save bank card config: {}", e))?;

    println!("✅ 银行卡配置已保存到: {:?}", config_path);
    Ok(())
}

// Email Configuration Commands
#[tauri::command]
async fn read_email_config() -> Result<String, String> {
    use std::fs;

    // 获取工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    let config_path = current_dir.join("email_config.json");

    if config_path.exists() {
        fs::read_to_string(&config_path).map_err(|e| format!("Failed to read email config: {}", e))
    } else {
        // 如果文件不存在，返回空字符串，前端会使用默认配置
        Ok(String::new())
    }
}

#[tauri::command]
async fn save_email_config(config: String) -> Result<(), String> {
    use std::fs;

    // 获取工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    let config_path = current_dir.join("email_config.json");

    // 验证JSON格式
    serde_json::from_str::<serde_json::Value>(&config)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;

    fs::write(&config_path, config).map_err(|e| format!("Failed to save email config: {}", e))?;

    println!("✅ 邮箱配置已保存到: {:?}", config_path);
    Ok(())
}

// 获取邮箱配置的辅助函数
async fn get_email_config() -> Result<EmailConfig, String> {
    match read_email_config().await {
        Ok(config_str) if !config_str.is_empty() => {
            match serde_json::from_str::<EmailConfig>(&config_str) {
                Ok(config) => {
                    // 验证配置是否完整
                    if config.worker_domain.is_empty()
                        || config.email_domain.is_empty()
                        || config.admin_password.is_empty()
                    {
                        return Err("邮箱配置不完整，请先在前端配置邮箱域名和密码".to_string());
                    }
                    Ok(config)
                }
                Err(e) => Err(format!("解析邮箱配置失败: {}", e)),
            }
        }
        _ => Err("未找到邮箱配置，请先在前端配置邮箱域名和密码".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_available_backups,
            extract_backup_ids,
            delete_backup,
            restore_machine_ids,
            get_cursor_paths,
            check_cursor_installation,
            reset_machine_ids,
            complete_cursor_reset,
            get_current_machine_ids,
            get_machine_id_file_content,
            get_backup_directory_info,
            check_user_authorization,
            get_token_auto,
            debug_cursor_paths,
            get_account_list,
            add_account,
            edit_account,
            switch_account,
            switch_account_with_token,
            remove_account,
            logout_current_account,
            open_cancel_subscription_page,
            show_cancel_subscription_window,
            cancel_subscription_failed,
            delete_cursor_account,
            trigger_authorization_login,
            trigger_authorization_login_poll,
            get_usage_for_period,
            get_user_analytics,
            get_usage_events,
            register_cursor_account,
            create_temp_email,
            register_with_email,
            register_with_cloudflare_temp_email,
            register_with_outlook,
            submit_verification_code,
            cancel_registration,
            get_saved_accounts,
            read_bank_card_config,
            save_bank_card_config,
            read_email_config,
            save_email_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
