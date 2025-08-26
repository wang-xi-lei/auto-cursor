mod machine_id;
mod auth_checker;
mod account_manager;

use machine_id::{MachineIdRestorer, BackupInfo, MachineIds, RestoreResult, ResetResult};
use auth_checker::{AuthChecker, AuthCheckResult, TokenInfo};
use account_manager::{AccountManager, AccountListResult, SwitchAccountResult, LogoutResult};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_available_backups() -> Result<Vec<BackupInfo>, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    restorer.find_backups()
        .map_err(|e| format!("Failed to find backups: {}", e))
}

#[tauri::command]
async fn extract_backup_ids(backup_path: String) -> Result<MachineIds, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer.extract_ids_from_backup(&backup_path)
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
        },
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
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    let mut details = Vec::new();
    let mut success = true;
    
    // Extract IDs from backup
    let ids = match restorer.extract_ids_from_backup(&backup_path) {
        Ok(ids) => {
            details.push("Successfully extracted IDs from backup".to_string());
            ids
        },
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
        },
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
        },
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
        },
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
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    Ok((
        restorer.db_path.to_string_lossy().to_string(),
        restorer.sqlite_path.to_string_lossy().to_string(),
    ))
}

#[tauri::command] 
async fn check_cursor_installation() -> Result<bool, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    Ok(restorer.db_path.exists() || restorer.sqlite_path.exists())
}

#[tauri::command]
async fn reset_machine_ids() -> Result<ResetResult, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    restorer.reset_machine_ids()
        .map_err(|e| format!("Failed to reset machine IDs: {}", e))
}

#[tauri::command]
async fn complete_cursor_reset() -> Result<ResetResult, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    restorer.complete_cursor_reset()
        .map_err(|e| format!("Failed to complete Cursor reset: {}", e))
}

#[tauri::command]
async fn get_current_machine_ids() -> Result<Option<MachineIds>, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    restorer.get_current_machine_ids()
        .map_err(|e| format!("Failed to get current machine IDs: {}", e))
}

#[tauri::command]
async fn get_machine_id_file_content() -> Result<Option<String>, String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;
    
    restorer.get_machine_id_file_content()
        .map_err(|e| format!("Failed to get machine ID file content: {}", e))
}

#[tauri::command]
async fn get_backup_directory_info() -> Result<(String, Vec<String>), String> {
    let restorer = MachineIdRestorer::new()
        .map_err(|e| format!("Failed to initialize restorer: {}", e))?;

    restorer.get_backup_directory_info()
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
    AuthChecker::debug_cursor_paths()
        .map_err(|e| format!("Failed to debug cursor paths: {}", e))
}

// Account Management Commands
#[tauri::command]
async fn get_account_list() -> Result<AccountListResult, String> {
    Ok(AccountManager::get_account_list())
}

#[tauri::command]
async fn add_account(email: String, token: String, refresh_token: Option<String>) -> Result<serde_json::Value, String> {
    match AccountManager::add_account(email.clone(), token, refresh_token) {
        Ok(()) => Ok(serde_json::json!({
            "success": true,
            "message": format!("Account {} added successfully", email)
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "message": format!("Failed to add account: {}", e)
        }))
    }
}

#[tauri::command]
async fn switch_account(email: String) -> Result<SwitchAccountResult, String> {
    Ok(AccountManager::switch_account(email))
}

#[tauri::command]
async fn switch_account_with_token(email: String, token: String, auth_type: Option<String>) -> Result<SwitchAccountResult, String> {
    Ok(AccountManager::switch_account_with_token(email, token, auth_type))
}

#[tauri::command]
async fn edit_account(email: String, new_token: Option<String>, new_refresh_token: Option<String>) -> Result<serde_json::Value, String> {
    println!("🔍 [DEBUG] edit_account called with email: {}, new_token: {:?}, new_refresh_token: {:?}",
             email, new_token.as_ref().map(|t| format!("{}...", &t[..t.len().min(10)])),
             new_refresh_token.as_ref().map(|t| format!("{}...", &t[..t.len().min(10)])));

    match AccountManager::edit_account(email.clone(), new_token, new_refresh_token) {
        Ok(()) => {
            println!("✅ [DEBUG] Account {} updated successfully", email);
            Ok(serde_json::json!({
                "success": true,
                "message": format!("Account {} updated successfully", email)
            }))
        },
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
        }))
    }
}

#[tauri::command]
async fn logout_current_account() -> Result<LogoutResult, String> {
    Ok(AccountManager::logout_current_account())
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
            logout_current_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
