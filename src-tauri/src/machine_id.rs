use anyhow::{Context, Result};
use dirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MachineIds {
    #[serde(rename = "telemetry.devDeviceId")]
    pub dev_device_id: String,
    #[serde(rename = "telemetry.macMachineId")]
    pub mac_machine_id: String,
    #[serde(rename = "telemetry.machineId")]
    pub machine_id: String,
    #[serde(rename = "telemetry.sqmId")]
    pub sqm_id: String,
    #[serde(rename = "storage.serviceMachineId")]
    pub service_machine_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub path: String,
    pub filename: String,
    pub timestamp: String,
    pub size: u64,
    pub date_formatted: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub message: String,
    pub details: Vec<String>,
}

pub struct MachineIdRestorer {
    pub db_path: PathBuf,
    pub sqlite_path: PathBuf,
}

impl MachineIdRestorer {
    pub fn new() -> Result<Self> {
        let (db_path, sqlite_path) = Self::get_cursor_paths()?;

        Ok(Self {
            db_path,
            sqlite_path,
        })
    }

    #[cfg(target_os = "windows")]
    fn get_cursor_paths() -> Result<(PathBuf, PathBuf)> {
        let appdata = std::env::var("APPDATA").context("APPDATA environment variable not set")?;

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
        let home = dirs::home_dir().context("Could not find home directory")?;

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
        let home = dirs::home_dir().context("Could not find home directory")?;

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

    pub fn find_backups(&self) -> Result<Vec<BackupInfo>> {
        let db_dir = self
            .db_path
            .parent()
            .context("Could not get parent directory")?;
        let db_name = self
            .db_path
            .file_name()
            .context("Could not get filename")?
            .to_string_lossy();

        let mut backups = Vec::new();

        // Read directory and filter backup files
        if let Ok(entries) = fs::read_dir(db_dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy();

                        // Check if this is a backup file (ends with .bak.timestamp)
                        if filename_str.starts_with(&*db_name) && filename_str.contains(".bak.") {
                            if let Ok(metadata) = fs::metadata(&path) {
                                // Extract timestamp from filename
                                let parts: Vec<&str> = filename_str.split('.').collect();
                                let timestamp_str = parts.last().map_or("unknown", |v| *v);
                                let date_formatted = Self::format_timestamp(timestamp_str);

                                backups.push(BackupInfo {
                                    path: path.to_string_lossy().to_string(),
                                    filename: filename_str.to_string(),
                                    timestamp: timestamp_str.to_string(),
                                    size: metadata.len(),
                                    date_formatted,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Sort by timestamp (newest first)
        backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        Ok(backups)
    }

    fn format_timestamp(timestamp_str: &str) -> String {
        if let Ok(datetime) = chrono::NaiveDateTime::parse_from_str(timestamp_str, "%Y%m%d_%H%M%S")
        {
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
        } else {
            "Unknown date".to_string()
        }
    }

    pub fn extract_ids_from_backup(&self, backup_path: &str) -> Result<MachineIds> {
        let content = fs::read_to_string(backup_path).context("Failed to read backup file")?;

        let data: serde_json::Value =
            serde_json::from_str(&content).context("Failed to parse backup JSON")?;

        let dev_device_id = data
            .get("telemetry.devDeviceId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mac_machine_id = data
            .get("telemetry.macMachineId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let machine_id = data
            .get("telemetry.machineId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let sqm_id = data
            .get("telemetry.sqmId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let service_machine_id = data
            .get("storage.serviceMachineId")
            .and_then(|v| v.as_str())
            .unwrap_or(&dev_device_id)
            .to_string();

        Ok(MachineIds {
            dev_device_id,
            mac_machine_id,
            machine_id,
            sqm_id,
            service_machine_id,
        })
    }

    pub fn create_backup(&self) -> Result<String> {
        if !self.db_path.exists() {
            return Err(anyhow::anyhow!("Current storage.json file not found"));
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = format!(
            "{}.restore_bak.{}",
            self.db_path.to_string_lossy(),
            timestamp
        );

        fs::copy(&self.db_path, &backup_path).context("Failed to create backup")?;

        Ok(backup_path)
    }

    pub fn update_storage_file(&self, ids: &MachineIds) -> Result<()> {
        if !self.db_path.exists() {
            return Err(anyhow::anyhow!("Current storage.json file not found"));
        }

        // Read current file
        let content =
            fs::read_to_string(&self.db_path).context("Failed to read current storage file")?;

        let mut data: serde_json::Value =
            serde_json::from_str(&content).context("Failed to parse current storage JSON")?;

        // Update IDs
        if let Some(obj) = data.as_object_mut() {
            obj.insert(
                "telemetry.devDeviceId".to_string(),
                serde_json::Value::String(ids.dev_device_id.clone()),
            );
            obj.insert(
                "telemetry.macMachineId".to_string(),
                serde_json::Value::String(ids.mac_machine_id.clone()),
            );
            obj.insert(
                "telemetry.machineId".to_string(),
                serde_json::Value::String(ids.machine_id.clone()),
            );
            obj.insert(
                "telemetry.sqmId".to_string(),
                serde_json::Value::String(ids.sqm_id.clone()),
            );
            obj.insert(
                "storage.serviceMachineId".to_string(),
                serde_json::Value::String(ids.service_machine_id.clone()),
            );
        }

        // Write updated file
        let updated_content =
            serde_json::to_string_pretty(&data).context("Failed to serialize updated data")?;

        fs::write(&self.db_path, updated_content)
            .context("Failed to write updated storage file")?;

        Ok(())
    }

    pub fn update_sqlite_db(&self, _ids: &MachineIds) -> Result<Vec<String>> {
        // SQLite functionality removed for simplicity
        // Return a note that this feature is not implemented
        Ok(vec![
            "SQLite database update skipped (feature not implemented)".to_string(),
        ])
    }

    pub fn get_machine_id_path() -> Result<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            let appdata =
                std::env::var("APPDATA").context("APPDATA environment variable not set")?;
            Ok(PathBuf::from(appdata).join("Cursor").join("machineId"))
        }

        #[cfg(target_os = "macos")]
        {
            let home = dirs::home_dir().context("Could not find home directory")?;
            Ok(home
                .join("Library")
                .join("Application Support")
                .join("Cursor")
                .join("machineId"))
        }

        #[cfg(target_os = "linux")]
        {
            let home = dirs::home_dir().context("Could not find home directory")?;
            Ok(home.join(".config").join("Cursor").join("machineId"))
        }
    }

    pub fn update_machine_id_file(&self, dev_device_id: &str) -> Result<()> {
        let machine_id_path = Self::get_machine_id_path()?;

        // Create directory if not exists
        if let Some(parent) = machine_id_path.parent() {
            fs::create_dir_all(parent).context("Failed to create machine ID directory")?;
        }

        // Backup existing file if it exists
        if machine_id_path.exists() {
            let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
            let backup_path = format!(
                "{}.restore_bak.{}",
                machine_id_path.to_string_lossy(),
                timestamp
            );
            let _ = fs::copy(&machine_id_path, backup_path);
        }

        // Write new ID
        fs::write(&machine_id_path, dev_device_id).context("Failed to write machine ID file")?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub fn update_system_ids(&self, ids: &MachineIds) -> Result<Vec<String>> {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut results = Vec::new();

        // Update MachineGuid
        if !ids.dev_device_id.is_empty() {
            match RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
                "SOFTWARE\\Microsoft\\Cryptography",
                KEY_WRITE | KEY_WOW64_64KEY,
            ) {
                Ok(key) => {
                    if key.set_value("MachineGuid", &ids.dev_device_id).is_ok() {
                        results.push("Windows MachineGuid updated successfully".to_string());
                    } else {
                        results.push("Failed to update Windows MachineGuid".to_string());
                    }
                }
                Err(_) => {
                    results.push("Permission denied: Cannot update Windows MachineGuid".to_string())
                }
            }
        }

        // Update SQMClient MachineId
        if !ids.sqm_id.is_empty() {
            match RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
                "SOFTWARE\\Microsoft\\SQMClient",
                KEY_WRITE | KEY_WOW64_64KEY,
            ) {
                Ok(key) => {
                    if key.set_value("MachineId", &ids.sqm_id).is_ok() {
                        results.push("Windows SQM MachineId updated successfully".to_string());
                    } else {
                        results.push("Failed to update Windows SQM MachineId".to_string());
                    }
                }
                Err(_) => results
                    .push("SQMClient registry key not found or permission denied".to_string()),
            }
        }

        Ok(results)
    }

    #[cfg(target_os = "macos")]
    pub fn update_system_ids(&self, ids: &MachineIds) -> Result<Vec<String>> {
        let mut results = Vec::new();

        if !ids.mac_machine_id.is_empty() {
            let uuid_file =
                "/var/root/Library/Preferences/SystemConfiguration/com.apple.platform.uuid.plist";

            if Path::new(uuid_file).exists() {
                let cmd = format!(
                    "sudo plutil -replace \"UUID\" -string \"{}\" \"{}\"",
                    ids.mac_machine_id, uuid_file
                );

                match std::process::Command::new("sh")
                    .arg("-c")
                    .arg(&cmd)
                    .output()
                {
                    Ok(output) => {
                        if output.status.success() {
                            results.push("macOS platform UUID updated successfully".to_string());
                        } else {
                            results.push("Failed to execute plutil command".to_string());
                        }
                    }
                    Err(_) => {
                        results.push("Failed to update macOS platform UUID".to_string());
                    }
                }
            } else {
                results.push("macOS platform UUID file not found".to_string());
            }
        }

        Ok(results)
    }

    #[cfg(target_os = "linux")]
    pub fn update_system_ids(&self, _ids: &MachineIds) -> Result<Vec<String>> {
        Ok(vec!["Linux system ID updates not implemented".to_string()])
    }
}
