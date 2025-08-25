use anyhow::{Context, Result};
use dirs;
use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

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

#[derive(Debug, Serialize, Deserialize)]
pub struct ResetResult {
    pub success: bool,
    pub message: String,
    pub details: Vec<String>,
    pub new_ids: Option<MachineIds>,
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

                        // Check if this is a backup file
                        // Support multiple backup formats: .bak.timestamp, .backup.timestamp, .restore_bak.timestamp
                        let is_backup = filename_str.starts_with(&*db_name)
                            && (filename_str.contains(".bak.")
                                || filename_str.contains(".backup.")
                                || filename_str.contains(".restore_bak."));

                        if is_backup {
                            if let Ok(metadata) = fs::metadata(&path) {
                                // Extract timestamp from filename
                                let timestamp_str =
                                    if let Some(bak_pos) = filename_str.find(".bak.") {
                                        &filename_str[bak_pos + 5..]
                                    } else if let Some(backup_pos) = filename_str.find(".backup.") {
                                        &filename_str[backup_pos + 8..]
                                    } else if let Some(restore_bak_pos) =
                                        filename_str.find(".restore_bak.")
                                    {
                                        &filename_str[restore_bak_pos + 12..]
                                    } else {
                                        "unknown"
                                    };

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
        let backup_path = format!("{}.bak.{}", self.db_path.to_string_lossy(), timestamp);

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
            let backup_path = format!("{}.bak.{}", machine_id_path.to_string_lossy(), timestamp);
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

    pub fn generate_new_machine_ids(&self) -> Result<MachineIds> {
        // Generate new UUID for dev device ID
        let dev_device_id = Uuid::new_v4().to_string();

        // Generate new machineId (64 characters of hexadecimal)
        let mut machine_id_data = [0u8; 32];
        rand::thread_rng().fill(&mut machine_id_data);
        let machine_id = format!("{:x}", Sha256::digest(&machine_id_data));

        // Generate new macMachineId (128 characters of hexadecimal)
        let mut mac_machine_id_data = [0u8; 64];
        rand::thread_rng().fill(&mut mac_machine_id_data);
        let mac_machine_id = format!("{:x}", Sha512::digest(&mac_machine_id_data));

        // Generate new sqmId
        let sqm_id = format!("{{{}}}", Uuid::new_v4().to_string().to_uppercase());

        Ok(MachineIds {
            dev_device_id: dev_device_id.clone(),
            mac_machine_id,
            machine_id,
            sqm_id,
            service_machine_id: dev_device_id, // Same as dev_device_id
        })
    }

    pub fn reset_machine_ids(&self) -> Result<ResetResult> {
        let mut details = Vec::new();
        let mut success = true;

        details.push("Starting machine ID reset process...".to_string());

        // Check if storage file exists
        if !self.db_path.exists() {
            return Ok(ResetResult {
                success: false,
                message: format!("Storage file not found: {}", self.db_path.display()),
                details,
                new_ids: None,
            });
        }

        // Create backup of current state
        match self.create_backup() {
            Ok(backup_path) => {
                details.push(format!("Created backup at: {}", backup_path));
            }
            Err(e) => {
                details.push(format!("Warning: Failed to create backup: {}", e));
            }
        }

        // Generate new machine IDs
        let new_ids = match self.generate_new_machine_ids() {
            Ok(ids) => {
                details.push("Generated new machine IDs".to_string());
                ids
            }
            Err(e) => {
                return Ok(ResetResult {
                    success: false,
                    message: format!("Failed to generate new IDs: {}", e),
                    details,
                    new_ids: None,
                });
            }
        };

        // Update storage file
        if let Err(e) = self.update_storage_file(&new_ids) {
            success = false;
            details.push(format!("Failed to update storage file: {}", e));
        } else {
            details.push("Successfully updated storage.json".to_string());
        }

        // Update SQLite database
        match self.update_sqlite_db(&new_ids) {
            Ok(sqlite_results) => {
                details.extend(sqlite_results);
            }
            Err(e) => {
                details.push(format!("Warning: Failed to update SQLite database: {}", e));
            }
        }

        // Update machine ID file
        if let Err(e) = self.update_machine_id_file(&new_ids.dev_device_id) {
            details.push(format!("Warning: Failed to update machine ID file: {}", e));
        } else {
            details.push("Successfully updated machine ID file".to_string());
        }

        // Update system IDs
        match self.update_system_ids(&new_ids) {
            Ok(system_results) => {
                details.extend(system_results);
            }
            Err(e) => {
                details.push(format!("Warning: Failed to update system IDs: {}", e));
            }
        }

        let message = if success {
            "Machine IDs reset successfully".to_string()
        } else {
            "Machine ID reset completed with some errors".to_string()
        };

        Ok(ResetResult {
            success,
            message,
            details,
            new_ids: Some(new_ids),
        })
    }

    pub fn get_cursor_app_paths() -> Result<(PathBuf, PathBuf)> {
        #[cfg(target_os = "windows")]
        {
            let localappdata = std::env::var("LOCALAPPDATA")
                .context("LOCALAPPDATA environment variable not set")?;

            let cursor_path = PathBuf::from(&localappdata)
                .join("Programs")
                .join("Cursor")
                .join("resources")
                .join("app");

            let package_json = cursor_path.join("package.json");
            let main_js = cursor_path.join("out").join("main.js");

            Ok((package_json, main_js))
        }

        #[cfg(target_os = "macos")]
        {
            let cursor_path = PathBuf::from("/Applications/Cursor.app/Contents/Resources/app");

            let package_json = cursor_path.join("package.json");
            let main_js = cursor_path.join("out").join("main.js");

            Ok((package_json, main_js))
        }

        #[cfg(target_os = "linux")]
        {
            let possible_paths = vec![
                PathBuf::from("/opt/Cursor/resources/app"),
                PathBuf::from("/usr/share/cursor/resources/app"),
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(".local/share/cursor/resources/app"),
                PathBuf::from("/usr/lib/cursor/app"),
            ];

            for cursor_path in possible_paths {
                let package_json = cursor_path.join("package.json");
                let main_js = cursor_path.join("out").join("main.js");

                if package_json.exists() && main_js.exists() {
                    return Ok((package_json, main_js));
                }
            }

            Err(anyhow::anyhow!(
                "Could not find Cursor installation on Linux"
            ))
        }
    }

    pub fn get_workbench_js_path() -> Result<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            let localappdata = std::env::var("LOCALAPPDATA")
                .context("LOCALAPPDATA environment variable not set")?;

            let workbench_path = PathBuf::from(&localappdata)
                .join("Programs")
                .join("Cursor")
                .join("resources")
                .join("app")
                .join("out")
                .join("vs")
                .join("workbench")
                .join("workbench.desktop.main.js");

            Ok(workbench_path)
        }

        #[cfg(target_os = "macos")]
        {
            let workbench_path = PathBuf::from("/Applications/Cursor.app/Contents/Resources/app")
                .join("out")
                .join("vs")
                .join("workbench")
                .join("workbench.desktop.main.js");

            Ok(workbench_path)
        }

        #[cfg(target_os = "linux")]
        {
            let possible_base_paths = vec![
                PathBuf::from("/opt/Cursor/resources/app"),
                PathBuf::from("/usr/share/cursor/resources/app"),
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(".local/share/cursor/resources/app"),
                PathBuf::from("/usr/lib/cursor/app"),
            ];

            for base_path in possible_base_paths {
                let workbench_path = base_path
                    .join("out")
                    .join("vs")
                    .join("workbench")
                    .join("workbench.desktop.main.js");

                if workbench_path.exists() {
                    return Ok(workbench_path);
                }
            }

            Err(anyhow::anyhow!(
                "Could not find Cursor workbench.desktop.main.js on Linux"
            ))
        }
    }

    pub fn modify_main_js(&self, main_js_path: &Path) -> Result<()> {
        if !main_js_path.exists() {
            return Err(anyhow::anyhow!(
                "main.js file not found: {}",
                main_js_path.display()
            ));
        }

        // Read the file content
        let content = fs::read_to_string(main_js_path).context("Failed to read main.js file")?;

        // Create backup
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = format!("{}.backup.{}", main_js_path.display(), timestamp);
        fs::copy(main_js_path, &backup_path).context("Failed to create backup of main.js")?;

        // Apply regex replacements
        let patterns = vec![
            (
                r"async getMachineId\(\)\{return [^??]+\?\?([^}]+)\}",
                r"async getMachineId(){return $1}",
            ),
            (
                r"async getMacMachineId\(\)\{return [^??]+\?\?([^}]+)\}",
                r"async getMacMachineId(){return $1}",
            ),
        ];

        let mut modified_content = content;
        for (pattern, replacement) in patterns {
            let re = Regex::new(pattern)?;
            modified_content = re.replace_all(&modified_content, replacement).to_string();
        }

        // Write back to file
        fs::write(main_js_path, modified_content).context("Failed to write modified main.js")?;

        Ok(())
    }

    pub fn inject_email_update_js(&self, email: &str) -> Result<()> {
        match Self::get_workbench_js_path() {
            Ok(workbench_path) => {
                if !workbench_path.exists() {
                    return Err(anyhow::anyhow!(
                        "workbench.desktop.main.js file not found: {}",
                        workbench_path.display()
                    ));
                }

                // Read the file content
                let content = fs::read_to_string(&workbench_path)
                    .context("Failed to read workbench.desktop.main.js file")?;

                // Create backup only if we haven't created one recently
                let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                let backup_path = format!("{}.backup.{}", workbench_path.display(), timestamp);
                fs::copy(&workbench_path, &backup_path)
                    .context("Failed to create backup of workbench.desktop.main.js")?;

                // Define markers to identify our injected code
                let start_marker = "// Email update injection - START";
                let end_marker = "// Email update injection - END";

                // Create the email update JavaScript code with dynamic email injection
                let email_update_script = format!(
                    r#"
{}
(function() {{
    try {{
        console.warn('Executing email update for: {}');

        function updateEmailDisplay(newEmail) {{
            const emailElement = document.querySelector('p[class="cursor-settings-sidebar-header-email"]');
            if (emailElement) {{
                emailElement.textContent = newEmail;
                console.warn('Email display updated to:', newEmail);
                return true;
            }}
            return false;
        }}

        // Try immediate update
        if (updateEmailDisplay('{}')) {{
            console.warn('Email updated successfully');
            return; // Exit if successful
        }}

        // If immediate update failed, use MutationObserver to watch for element
        console.warn('Email element not found, setting up DOM observer...');

        const observer = new MutationObserver(function(mutations) {{
            mutations.forEach(function(mutation) {{
                // Check if any new nodes were added
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {{
                    // Try to update email display
                    if (updateEmailDisplay('{}')) {{
                        console.warn('Email updated via DOM observer');
                        // observer.disconnect(); // Stop observing once successful
                    }}
                }}
            }});
        }});

        // Start observing the document for changes
        if (document.body) {{
            observer.observe(document.body, {{
                childList: true,
                subtree: true
            }});
            console.warn('DOM observer started, watching for email element...');
        }} else {{
            // If body not ready, wait for it
            document.addEventListener('DOMContentLoaded', function() {{
                observer.observe(document.body, {{
                    childList: true,
                    subtree: true
                }});
                console.warn('DOM observer started after DOMContentLoaded');
            }});
        }}

        // Observer will automatically stop when email element is found and updated
    }} catch (e) {{
        console.warn('Error updating email display:', e);
    }}
}})();
{}
"#,
                    start_marker, email, email, email, end_marker
                );

                // Check if our injection already exists and remove it
                let modified_content = if let Some(start_pos) = content.find(start_marker) {
                    if let Some(end_pos) = content.find(end_marker) {
                        // Remove existing injection
                        let before = &content[..start_pos];
                        let after = &content[end_pos + end_marker.len()..];
                        format!("{}{}{}", before, email_update_script, after)
                    } else {
                        // Start marker found but no end marker, append new injection
                        format!("{}\n{}", content, email_update_script)
                    }
                } else {
                    // No existing injection, append new one
                    format!("{}\n{}", content, email_update_script)
                };

                // Write back to file
                fs::write(&workbench_path, modified_content)
                    .context("Failed to write modified workbench.desktop.main.js")?;

                println!("Email update script injected for: {}", email);
                Ok(())
            }
            Err(e) => Err(anyhow::anyhow!(
                "Could not locate workbench.desktop.main.js: {}",
                e
            )),
        }
    }

    pub fn modify_workbench_js(&self, workbench_path: &Path) -> Result<()> {
        if !workbench_path.exists() {
            return Err(anyhow::anyhow!(
                "workbench.desktop.main.js file not found: {}",
                workbench_path.display()
            ));
        }

        // Read the file content
        let content = fs::read_to_string(workbench_path)
            .context("Failed to read workbench.desktop.main.js file")?;

        // Create backup
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = format!("{}.backup.{}", workbench_path.display(), timestamp);
        fs::copy(workbench_path, &backup_path)
            .context("Failed to create backup of workbench.desktop.main.js")?;

        // Platform-specific patterns
        let (button_pattern, button_replacement) = if cfg!(target_os = "windows")
            || cfg!(target_os = "linux")
        {
            (
                r#"$(k,E(Ks,{title:"Upgrade to Pro",size:"small",get codicon(){return F.rocket},get onClick(){return t.pay}}),null)"#,
                r#"$(k,E(Ks,{title:"yeongpin GitHub",size:"small",get codicon(){return F.rocket},get onClick(){return function(){window.open("https://github.com/yeongpin/cursor-free-vip","_blank")}}}),null)"#,
            )
        } else {
            (
                r#"M(x,I(as,{title:"Upgrade to Pro",size:"small",get codicon(){return $.rocket},get onClick(){return t.pay}}),null)"#,
                r#"M(x,I(as,{title:"yeongpin GitHub",size:"small",get codicon(){return $.rocket},get onClick(){return function(){window.open("https://github.com/yeongpin/cursor-free-vip","_blank")}}}),null)"#,
            )
        };

        // Apply replacements
        let mut modified_content = content;

        // Button replacement
        modified_content = modified_content.replace(button_pattern, button_replacement);

        // Badge replacement
        modified_content = modified_content.replace("<div>Pro Trial", "<div>Pro");

        // Toast hiding
        modified_content =
            modified_content.replace("notifications-toasts", "notifications-toasts hidden");

        // Token limit bypass
        modified_content = modified_content.replace(
            "async getEffectiveTokenLimit(e){const n=e.modelName;if(!n)return 2e5;",
            "async getEffectiveTokenLimit(e){return 9000000;const n=e.modelName;if(!n)return 9e5;",
        );

        // Pro status modification
        modified_content = modified_content.replace(
            r#"var DWr=ne("<div class=settings__item_description>You are currently signed in with <strong></strong>.");"#,
            r#"var DWr=ne("<div class=settings__item_description>You are currently signed in with <strong></strong>. <h1>Pro</h1>");"#,
        );

        // Write back to file
        fs::write(workbench_path, modified_content)
            .context("Failed to write modified workbench.desktop.main.js")?;

        Ok(())
    }

    pub fn complete_cursor_reset(&self) -> Result<ResetResult> {
        let mut details = Vec::new();
        let mut success = true;

        details.push("Starting complete Cursor reset process...".to_string());

        // First, reset machine IDs
        match self.reset_machine_ids() {
            Ok(reset_result) => {
                details.extend(reset_result.details);
                if !reset_result.success {
                    success = false;
                }
            }
            Err(e) => {
                success = false;
                details.push(format!("Failed to reset machine IDs: {}", e));
            }
        }

        // Modify main.js
        match Self::get_cursor_app_paths() {
            Ok((package_json, main_js)) => {
                if package_json.exists() && main_js.exists() {
                    match self.modify_main_js(&main_js) {
                        Ok(()) => {
                            details.push("Successfully modified main.js".to_string());
                        }
                        Err(e) => {
                            details.push(format!("Warning: Failed to modify main.js: {}", e));
                        }
                    }
                } else {
                    details.push("Warning: Could not find Cursor main.js file".to_string());
                }
            }
            Err(e) => {
                details.push(format!(
                    "Warning: Could not locate Cursor installation: {}",
                    e
                ));
            }
        }

        // Modify workbench.desktop.main.js
        match Self::get_workbench_js_path() {
            Ok(workbench_path) => {
                if workbench_path.exists() {
                    match self.modify_workbench_js(&workbench_path) {
                        Ok(()) => {
                            details.push(
                                "Successfully modified workbench.desktop.main.js".to_string(),
                            );
                        }
                        Err(e) => {
                            details.push(format!(
                                "Warning: Failed to modify workbench.desktop.main.js: {}",
                                e
                            ));
                        }
                    }
                } else {
                    details
                        .push("Warning: Could not find workbench.desktop.main.js file".to_string());
                }
            }
            Err(e) => {
                details.push(format!(
                    "Warning: Could not locate workbench.desktop.main.js: {}",
                    e
                ));
            }
        }

        let message = if success {
            "Complete Cursor reset successful".to_string()
        } else {
            "Complete Cursor reset completed with some errors".to_string()
        };

        Ok(ResetResult {
            success,
            message,
            details,
            new_ids: None,
        })
    }

    pub fn get_current_machine_ids(&self) -> Result<Option<MachineIds>> {
        if !self.db_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.db_path).context("Failed to read storage file")?;

        let data: serde_json::Value =
            serde_json::from_str(&content).context("Failed to parse storage JSON")?;

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

        // Check if any IDs exist
        if dev_device_id.is_empty()
            && mac_machine_id.is_empty()
            && machine_id.is_empty()
            && sqm_id.is_empty()
            && service_machine_id.is_empty()
        {
            return Ok(None);
        }

        Ok(Some(MachineIds {
            dev_device_id,
            mac_machine_id,
            machine_id,
            sqm_id,
            service_machine_id,
        }))
    }

    pub fn get_machine_id_file_content(&self) -> Result<Option<String>> {
        let machine_id_path = Self::get_machine_id_path()?;

        if !machine_id_path.exists() {
            return Ok(None);
        }

        let content =
            fs::read_to_string(&machine_id_path).context("Failed to read machine ID file")?;

        Ok(Some(content.trim().to_string()))
    }

    pub fn get_backup_directory_info(&self) -> Result<(String, Vec<String>)> {
        let db_dir = self
            .db_path
            .parent()
            .context("Could not get parent directory")?;

        let mut all_files = Vec::new();

        if let Ok(entries) = fs::read_dir(db_dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy().to_string();
                        // Only include storage.json related files
                        if filename_str.contains("storage.json") {
                            all_files.push(filename_str);
                        }
                    }
                }
            }
        }

        all_files.sort();

        Ok((db_dir.to_string_lossy().to_string(), all_files))
    }
}
