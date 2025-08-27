mod account_manager;
mod auth_checker;
mod machine_id;

use account_manager::{AccountListResult, AccountManager, LogoutResult, SwitchAccountResult};
use auth_checker::{AuthCheckResult, AuthChecker, TokenInfo};
use machine_id::{BackupInfo, MachineIdRestorer, MachineIds, ResetResult, RestoreResult};
use tauri::{Emitter, Manager};

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
    .visible(false) // 默认隐藏窗口
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
            delete_cursor_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
