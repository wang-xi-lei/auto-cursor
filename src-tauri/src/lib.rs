mod machine_id;

use machine_id::{MachineIdRestorer, BackupInfo, MachineIds, RestoreResult};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_available_backups,
            extract_backup_ids,
            restore_machine_ids,
            get_cursor_paths,
            check_cursor_installation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
