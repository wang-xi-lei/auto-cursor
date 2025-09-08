use anyhow::{Context, Result};
use chrono::Local;
use dirs;
use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::fs::{self, OpenOptions};
use std::io::Write;
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
    pub log_file_path: PathBuf,
}

impl MachineIdRestorer {
    pub fn new() -> Result<Self> {
        let (db_path, sqlite_path) = Self::get_cursor_paths()?;

        // 创建日志文件路径（在工作目录）
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let log_file_path = current_dir.join(format!("cursor_reset_{}.log", timestamp));

        Ok(Self {
            db_path,
            sqlite_path,
            log_file_path,
        })
    }

    // 日志记录方法
    pub fn log_info(&self, message: &str) {
        self.write_log("INFO", message);
    }

    pub fn log_warning(&self, message: &str) {
        self.write_log("WARN", message);
    }

    pub fn log_error(&self, message: &str) {
        self.write_log("ERROR", message);
    }

    pub fn log_debug(&self, message: &str) {
        self.write_log("DEBUG", message);
    }

    fn write_log(&self, level: &str, message: &str) {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let log_entry = format!("[{}] [{}] {}\n", timestamp, level, message);

        // 输出到控制台
        println!("{}", log_entry.trim());

        // 写入日志文件
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file_path)
        {
            let _ = file.write_all(log_entry.as_bytes());
            let _ = file.flush();
        }
    }

    pub fn log_system_info(&self) {
        self.log_info("=== 系统信息 ===");
        self.log_info(&format!("操作系统: {}", std::env::consts::OS));
        self.log_info(&format!("架构: {}", std::env::consts::ARCH));
        self.log_info(&format!(
            "工作目录: {:?}",
            std::env::current_dir().unwrap_or_default()
        ));
        self.log_info(&format!("存储文件路径: {:?}", self.db_path));
        self.log_info(&format!("SQLite路径: {:?}", self.sqlite_path));
        self.log_info(&format!("日志文件路径: {:?}", self.log_file_path));

        // 检查文件是否存在
        self.log_info(&format!("存储文件是否存在: {}", self.db_path.exists()));
        self.log_info(&format!(
            "SQLite文件是否存在: {}",
            self.sqlite_path.exists()
        ));

        // 获取当前用户
        if let Ok(username) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
            self.log_info(&format!("当前用户: {}", username));
        }

        self.log_info("=== 系统信息结束 ===");
    }

    pub fn get_log_file_path(&self) -> &PathBuf {
        &self.log_file_path
    }

    // 测试日志记录功能
    pub fn test_logging(&self) -> Result<String> {
        self.log_info("=== 日志记录功能测试开始 ===");
        self.log_debug("这是一条调试信息");
        self.log_warning("这是一条警告信息");
        self.log_error("这是一条错误信息（测试用）");
        self.log_info("=== 日志记录功能测试完成 ===");

        Ok(format!(
            "日志记录测试完成，日志文件位置: {:?}",
            self.log_file_path
        ))
    }

    // 调试Windows Cursor路径
    pub fn debug_windows_cursor_paths(&self) -> Result<Vec<String>> {
        let mut debug_info = Vec::new();

        self.log_info("=== Windows Cursor路径调试开始 ===");
        debug_info.push("=== Windows Cursor路径调试开始 ===".to_string());

        #[cfg(target_os = "windows")]
        {
            let localappdata =
                std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "LOCALAPPDATA未设置".to_string());

            let info = format!("LOCALAPPDATA: {}", localappdata);
            self.log_info(&info);
            debug_info.push(info);

            // 检查所有可能的路径
            let possible_cursor_paths = vec![
                format!("{}\\Programs\\Cursor\\resources\\app", localappdata),
                format!("{}\\Programs\\cursor\\resources\\app", localappdata),
                format!("{}\\Cursor\\resources\\app", localappdata),
                "C:\\Program Files\\Cursor\\resources\\app".to_string(),
                "C:\\Program Files (x86)\\Cursor\\resources\\app".to_string(),
                format!(
                    "{}\\AppData\\Local\\Programs\\Cursor\\resources\\app",
                    dirs::home_dir().unwrap_or_default().to_string_lossy()
                ),
                "C:\\Cursor\\resources\\app".to_string(),
            ];

            for (i, path) in possible_cursor_paths.iter().enumerate() {
                let path_buf = PathBuf::from(path);
                let package_json = path_buf.join("package.json");
                let main_js = path_buf.join("out").join("main.js");
                let workbench_js = path_buf
                    .join("out")
                    .join("vs")
                    .join("workbench")
                    .join("workbench.desktop.main.js");

                let path_info = format!(
                    "路径{}: {}\n  - 目录存在: {}\n  - package.json: {}\n  - main.js: {}\n  - workbench.js: {}",
                    i + 1,
                    path,
                    path_buf.exists(),
                    package_json.exists(),
                    main_js.exists(),
                    workbench_js.exists()
                );

                self.log_info(&path_info);
                debug_info.push(path_info);
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let info = "此功能仅在Windows上可用".to_string();
            self.log_warning(&info);
            debug_info.push(info);
        }

        self.log_info("=== Windows Cursor路径调试结束 ===");
        debug_info.push("=== Windows Cursor路径调试结束 ===".to_string());

        Ok(debug_info)
    }

    // 设置自定义 Cursor 路径
    pub fn set_custom_cursor_path(&self, path: &str) -> Result<String> {
        let custom_path = PathBuf::from(path);

        // 验证路径是否有效
        let package_json = custom_path.join("package.json");
        let main_js = custom_path.join("out").join("main.js");
        let workbench_js = custom_path
            .join("out")
            .join("vs")
            .join("workbench")
            .join("workbench.desktop.main.js");

        let validation_info = format!(
            "路径验证结果:\n- 目录存在: {}\n- package.json: {}\n- main.js: {}\n- workbench.js: {}",
            custom_path.exists(),
            package_json.exists(),
            main_js.exists(),
            workbench_js.exists()
        );

        self.log_info(&format!("设置自定义Cursor路径: {}", path));
        self.log_info(&validation_info);

        // 保存自定义路径到配置文件
        let config_file = self.get_custom_path_config_file()?;
        fs::write(&config_file, path)?;

        self.log_info("自定义Cursor路径已保存");

        Ok(validation_info)
    }

    // 获取自定义 Cursor 路径
    pub fn get_custom_cursor_path(&self) -> Option<String> {
        match self.get_custom_path_config_file() {
            Ok(config_file) => {
                if config_file.exists() {
                    match fs::read_to_string(&config_file) {
                        Ok(path) => {
                            let path = path.trim();
                            if !path.is_empty() {
                                self.log_info(&format!("读取到自定义Cursor路径: {}", path));
                                return Some(path.to_string());
                            }
                        }
                        Err(e) => {
                            self.log_warning(&format!("读取自定义路径配置失败: {}", e));
                        }
                    }
                }
            }
            Err(e) => {
                self.log_warning(&format!("获取自定义路径配置文件路径失败: {}", e));
            }
        }
        None
    }

    // 清除自定义 Cursor 路径
    pub fn clear_custom_cursor_path(&self) -> Result<String> {
        let config_file = self.get_custom_path_config_file()?;

        if config_file.exists() {
            fs::remove_file(&config_file)?;
            self.log_info("自定义Cursor路径已清除");
            Ok("自定义Cursor路径已清除".to_string())
        } else {
            self.log_info("没有设置自定义Cursor路径");
            Ok("没有设置自定义Cursor路径".to_string())
        }
    }

    // 获取自定义路径配置文件路径
    fn get_custom_path_config_file(&self) -> Result<PathBuf> {
        let exe_dir = std::env::current_exe()?
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Could not get exe directory"))?
            .to_path_buf();

        Ok(exe_dir.join("custom_cursor_path.txt"))
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
        use winreg::RegKey;
        use winreg::enums::*;

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

        self.log_info("开始机器ID重置流程...");
        details.push("Starting machine ID reset process...".to_string());

        // 检查存储文件是否存在
        self.log_debug(&format!("检查存储文件: {:?}", self.db_path));
        if !self.db_path.exists() {
            let error_msg = format!("Storage file not found: {}", self.db_path.display());
            self.log_error(&error_msg);
            return Ok(ResetResult {
                success: false,
                message: error_msg,
                details,
                new_ids: None,
            });
        }
        self.log_info("存储文件存在，继续处理");

        // 创建当前状态的备份
        self.log_info("创建备份文件...");
        match self.create_backup() {
            Ok(backup_path) => {
                let backup_msg = format!("Created backup at: {}", backup_path);
                self.log_info(&backup_msg);
                details.push(backup_msg);
            }
            Err(e) => {
                let warning_msg = format!("Warning: Failed to create backup: {}", e);
                self.log_warning(&warning_msg);
                details.push(warning_msg);
            }
        }

        // 生成新的机器ID
        self.log_info("生成新的机器ID...");
        let new_ids = match self.generate_new_machine_ids() {
            Ok(ids) => {
                self.log_info(&format!("生成的新ID: dev_device_id={}, machine_id长度={}, mac_machine_id长度={}, sqm_id={}", 
                    ids.dev_device_id, ids.machine_id.len(), ids.mac_machine_id.len(), ids.sqm_id));
                details.push("Generated new machine IDs".to_string());
                ids
            }
            Err(e) => {
                let error_msg = format!("Failed to generate new IDs: {}", e);
                self.log_error(&error_msg);
                return Ok(ResetResult {
                    success: false,
                    message: error_msg,
                    details,
                    new_ids: None,
                });
            }
        };

        // 更新存储文件
        self.log_info("更新存储文件...");
        if let Err(e) = self.update_storage_file(&new_ids) {
            success = false;
            let error_msg = format!("Failed to update storage file: {}", e);
            self.log_error(&error_msg);
            details.push(error_msg);
        } else {
            let success_msg = "Successfully updated storage.json".to_string();
            self.log_info(&success_msg);
            details.push(success_msg);
        }

        // 更新SQLite数据库
        self.log_info("更新SQLite数据库...");
        match self.update_sqlite_db(&new_ids) {
            Ok(sqlite_results) => {
                for result in &sqlite_results {
                    self.log_debug(&format!("SQLite更新结果: {}", result));
                }
                details.extend(sqlite_results);
            }
            Err(e) => {
                let warning_msg = format!("Warning: Failed to update SQLite database: {}", e);
                self.log_warning(&warning_msg);
                details.push(warning_msg);
            }
        }

        // 更新机器ID文件
        self.log_info("更新机器ID文件...");
        if let Err(e) = self.update_machine_id_file(&new_ids.dev_device_id) {
            let warning_msg = format!("Warning: Failed to update machine ID file: {}", e);
            self.log_warning(&warning_msg);
            details.push(warning_msg);
        } else {
            let success_msg = "Successfully updated machine ID file".to_string();
            self.log_info(&success_msg);
            details.push(success_msg);
        }

        // 更新系统ID
        self.log_info("更新系统ID...");
        match self.update_system_ids(&new_ids) {
            Ok(system_results) => {
                for result in &system_results {
                    self.log_debug(&format!("系统ID更新结果: {}", result));
                }
                details.extend(system_results);
            }
            Err(e) => {
                let warning_msg = format!("Warning: Failed to update system IDs: {}", e);
                self.log_warning(&warning_msg);
                details.push(warning_msg);
            }
        }

        let message = if success {
            "Machine IDs reset successfully".to_string()
        } else {
            "Machine ID reset completed with some errors".to_string()
        };

        self.log_info(&format!("机器ID重置完成: {}", message));

        Ok(ResetResult {
            success,
            message,
            details,
            new_ids: Some(new_ids),
        })
    }

    pub fn get_cursor_app_paths() -> Result<(PathBuf, PathBuf)> {
        // 首先检查是否有自定义路径
        if let Ok(restorer) = MachineIdRestorer::new() {
            if let Some(custom_path) = restorer.get_custom_cursor_path() {
                let custom_path_buf = PathBuf::from(&custom_path);
                let package_json = custom_path_buf.join("package.json");
                let main_js = custom_path_buf.join("out").join("main.js");

                println!("🎯 [DEBUG] 使用自定义路径: {:?}", custom_path_buf);
                println!(
                    "🎯 [DEBUG] 自定义路径验证 - package.json存在: {}, main.js存在: {}",
                    package_json.exists(),
                    main_js.exists()
                );

                if package_json.exists() && main_js.exists() {
                    println!("✅ [DEBUG] 自定义路径有效，使用自定义路径");
                    return Ok((package_json, main_js));
                } else {
                    println!("❌ [DEBUG] 自定义路径无效，继续使用自动搜索");
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let localappdata = std::env::var("LOCALAPPDATA")
                .context("LOCALAPPDATA environment variable not set")?;

            // Windows上Cursor可能的安装路径
            let possible_cursor_paths = vec![
                // 方式1: LOCALAPPDATA路径 (用户安装)
                PathBuf::from(&localappdata)
                    .join("Programs")
                    .join("Cursor")
                    .join("resources")
                    .join("app"),
                // 方式2: LOCALAPPDATA路径的替代结构
                PathBuf::from(&localappdata)
                    .join("Programs")
                    .join("cursor")
                    .join("resources")
                    .join("app"),
                // 方式3: 直接在Cursor目录下
                PathBuf::from(&localappdata)
                    .join("Cursor")
                    .join("resources")
                    .join("app"),
                // 方式4: 系统Program Files路径 (管理员安装)
                PathBuf::from("C:\\Program Files\\Cursor\\resources\\app"),
                PathBuf::from("C:\\Program Files (x86)\\Cursor\\resources\\app"),
                // 方式5: 用户程序目录
                dirs::home_dir()
                    .unwrap_or_default()
                    .join("AppData\\Local\\Programs\\Cursor\\resources\\app"),
                // 方式6: 便携版路径
                PathBuf::from("C:\\Cursor\\resources\\app"),
            ];

            // 搜索存在的路径
            for (i, cursor_path) in possible_cursor_paths.iter().enumerate() {
                let package_json = cursor_path.join("package.json");
                let main_js = cursor_path.join("out").join("main.js");

                println!("🔍 [DEBUG] Windows路径搜索 {}: {:?}", i + 1, cursor_path);
                println!(
                    "🔍 [DEBUG] package.json: {:?}, 存在: {}",
                    package_json,
                    package_json.exists()
                );
                println!(
                    "🔍 [DEBUG] main.js: {:?}, 存在: {}",
                    main_js,
                    main_js.exists()
                );

                if package_json.exists() && main_js.exists() {
                    println!(
                        "✅ [DEBUG] 找到有效的Windows Cursor安装路径: {:?}",
                        cursor_path
                    );
                    return Ok((package_json, main_js));
                }
            }

            // 如果都找不到，返回最可能的路径用于错误提示
            let default_path = PathBuf::from(&localappdata)
                .join("Programs")
                .join("Cursor")
                .join("resources")
                .join("app");
            let package_json = default_path.join("package.json");
            let main_js = default_path.join("out").join("main.js");

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
        // 首先检查是否有自定义路径
        if let Ok(restorer) = MachineIdRestorer::new() {
            if let Some(custom_path) = restorer.get_custom_cursor_path() {
                let custom_workbench = PathBuf::from(&custom_path)
                    .join("out")
                    .join("vs")
                    .join("workbench")
                    .join("workbench.desktop.main.js");

                println!("🎯 [DEBUG] 使用自定义workbench路径: {:?}", custom_workbench);
                println!(
                    "🎯 [DEBUG] 自定义workbench存在: {}",
                    custom_workbench.exists()
                );

                if custom_workbench.exists() {
                    println!("✅ [DEBUG] 自定义workbench路径有效");
                    return Ok(custom_workbench);
                } else {
                    println!("❌ [DEBUG] 自定义workbench路径无效，继续使用自动搜索");
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let localappdata = std::env::var("LOCALAPPDATA")
                .context("LOCALAPPDATA environment variable not set")?;

            // Windows上Cursor workbench可能的路径
            let possible_workbench_paths = vec![
                // 方式1: LOCALAPPDATA路径 (用户安装)
                PathBuf::from(&localappdata)
                    .join("Programs")
                    .join("Cursor")
                    .join("resources")
                    .join("app")
                    .join("out")
                    .join("vs")
                    .join("workbench")
                    .join("workbench.desktop.main.js"),
                // 方式2: LOCALAPPDATA路径的替代结构
                PathBuf::from(&localappdata)
                    .join("Programs")
                    .join("cursor")
                    .join("resources")
                    .join("app")
                    .join("out")
                    .join("vs")
                    .join("workbench")
                    .join("workbench.desktop.main.js"),
                // 方式3: 直接在Cursor目录下
                PathBuf::from(&localappdata)
                    .join("Cursor")
                    .join("resources")
                    .join("app")
                    .join("out")
                    .join("vs")
                    .join("workbench")
                    .join("workbench.desktop.main.js"),
                // 方式4: 系统Program Files路径 (管理员安装)
                PathBuf::from("C:\\Program Files\\Cursor\\resources\\app\\out\\vs\\workbench\\workbench.desktop.main.js"),
                PathBuf::from("C:\\Program Files (x86)\\Cursor\\resources\\app\\out\\vs\\workbench\\workbench.desktop.main.js"),
                // 方式5: 用户程序目录
                dirs::home_dir()
                    .unwrap_or_default()
                    .join("AppData\\Local\\Programs\\Cursor\\resources\\app\\out\\vs\\workbench\\workbench.desktop.main.js"),
                // 方式6: 便携版路径
                PathBuf::from("C:\\Cursor\\resources\\app\\out\\vs\\workbench\\workbench.desktop.main.js"),
            ];

            // 搜索存在的路径
            for (i, workbench_path) in possible_workbench_paths.iter().enumerate() {
                println!(
                    "🔍 [DEBUG] Windows workbench路径搜索 {}: {:?}",
                    i + 1,
                    workbench_path
                );
                println!("🔍 [DEBUG] workbench存在: {}", workbench_path.exists());

                if workbench_path.exists() {
                    println!(
                        "✅ [DEBUG] 找到有效的Windows workbench路径: {:?}",
                        workbench_path
                    );
                    return Ok(workbench_path.clone());
                }
            }

            // 如果都找不到，返回最可能的路径用于错误提示
            let default_path = PathBuf::from(&localappdata)
                .join("Programs")
                .join("Cursor")
                .join("resources")
                .join("app")
                .join("out")
                .join("vs")
                .join("workbench")
                .join("workbench.desktop.main.js");

            Ok(default_path)
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
        self.log_info(&format!("开始修改main.js文件: {:?}", main_js_path));

        if !main_js_path.exists() {
            let error_msg = format!("main.js file not found: {}", main_js_path.display());
            self.log_error(&error_msg);
            return Err(anyhow::anyhow!(error_msg));
        }

        // 读取文件内容
        self.log_debug("读取main.js文件内容...");
        let content = fs::read_to_string(main_js_path).context("Failed to read main.js file")?;
        self.log_info(&format!("main.js文件大小: {} 字节", content.len()));

        // 创建备份
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = format!("{}.backup.{}", main_js_path.display(), timestamp);
        self.log_info(&format!("创建main.js备份: {}", backup_path));
        fs::copy(main_js_path, &backup_path).context("Failed to create backup of main.js")?;

        // 应用正则表达式替换
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

        let mut modified_content = content.clone();
        let mut patterns_applied = 0;

        for (i, (pattern, replacement)) in patterns.iter().enumerate() {
            self.log_debug(&format!("应用模式 {}: {}", i + 1, pattern));
            let re = Regex::new(pattern)?;
            let before_len = modified_content.len();
            modified_content = re.replace_all(&modified_content, *replacement).to_string();
            let after_len = modified_content.len();

            if before_len != after_len {
                patterns_applied += 1;
                self.log_info(&format!(
                    "模式 {} 已应用，内容长度从 {} 变为 {}",
                    i + 1,
                    before_len,
                    after_len
                ));
            } else {
                self.log_debug(&format!("模式 {} 未找到匹配项", i + 1));
            }
        }

        self.log_info(&format!("总共应用了 {} 个模式", patterns_applied));

        // 写回文件
        self.log_debug("写入修改后的main.js内容...");
        fs::write(main_js_path, modified_content).context("Failed to write modified main.js")?;
        self.log_info("main.js文件修改完成");

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
        self.log_info(&format!(
            "开始修改workbench.desktop.main.js文件: {:?}",
            workbench_path
        ));

        if !workbench_path.exists() {
            let error_msg = format!(
                "workbench.desktop.main.js file not found: {}",
                workbench_path.display()
            );
            self.log_error(&error_msg);
            return Err(anyhow::anyhow!(error_msg));
        }

        // 读取文件内容
        self.log_debug("读取workbench.desktop.main.js文件内容...");
        let content = fs::read_to_string(workbench_path)
            .context("Failed to read workbench.desktop.main.js file")?;
        self.log_info(&format!(
            "workbench.desktop.main.js文件大小: {} 字节",
            content.len()
        ));

        // 创建备份
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = format!("{}.backup.{}", workbench_path.display(), timestamp);
        self.log_info(&format!(
            "创建workbench.desktop.main.js备份: {}",
            backup_path
        ));
        fs::copy(workbench_path, &backup_path)
            .context("Failed to create backup of workbench.desktop.main.js")?;

        // 平台特定模式
        let (button_pattern, button_replacement) = if cfg!(target_os = "windows")
            || cfg!(target_os = "linux")
        {
            (
                r#"$(k,E(Ks,{title:"Upgrade to Pro",size:"small",get codicon(){return F.rocket},get onClick(){return t.pay}}),null)"#,
                r#"$(k,E(Ks,{title:"wuqi-y GitHub",size:"small",get codicon(){return F.rocket},get onClick(){return function(){window.open("https://github.com/wuqi-y/auto-cursor-releases","_blank")}}}),null)"#,
            )
        } else {
            (
                r#"M(x,I(as,{title:"Upgrade to Pro",size:"small",get codicon(){return $.rocket},get onClick(){return t.pay}}),null)"#,
                r#"M(x,I(as,{title:"wuqi-y GitHub",size:"small",get codicon(){return $.rocket},get onClick(){return function(){window.open("https://github.com/wuqi-y/auto-cursor-releases","_blank")}}}),null)"#,
            )
        };

        self.log_info(&format!(
            "当前平台: {}, 使用对应的按钮模式",
            std::env::consts::OS
        ));

        // 应用替换
        let mut modified_content = content.clone();
        let mut replacements_made = 0;

        // 按钮替换
        self.log_debug("应用按钮替换...");
        let before_len = modified_content.len();
        modified_content = modified_content.replace(button_pattern, button_replacement);
        if modified_content.len() != before_len {
            replacements_made += 1;
            self.log_info("按钮替换成功应用");
        } else {
            self.log_warning("按钮模式未找到匹配项");
        }

        // 徽章替换
        self.log_debug("应用徽章替换...");
        let before_len = modified_content.len();
        modified_content = modified_content.replace("<div>Pro Trial", "<div>Pro");
        if modified_content.len() != before_len {
            replacements_made += 1;
            self.log_info("徽章替换成功应用");
        } else {
            self.log_debug("徽章模式未找到匹配项");
        }

        // 隐藏通知
        self.log_debug("应用通知隐藏...");
        let before_len = modified_content.len();
        modified_content =
            modified_content.replace("notifications-toasts", "notifications-toasts hidden");
        if modified_content.len() != before_len {
            replacements_made += 1;
            self.log_info("通知隐藏成功应用");
        } else {
            self.log_debug("通知模式未找到匹配项");
        }

        // Token限制绕过
        self.log_debug("应用Token限制绕过...");
        let before_len = modified_content.len();
        modified_content = modified_content.replace(
            "async getEffectiveTokenLimit(e){const n=e.modelName;if(!n)return 2e5;",
            "async getEffectiveTokenLimit(e){return 9000000;const n=e.modelName;if(!n)return 9e5;",
        );
        if modified_content.len() != before_len {
            replacements_made += 1;
            self.log_info("Token限制绕过成功应用");
        } else {
            self.log_debug("Token限制模式未找到匹配项");
        }

        // Pro状态修改
        self.log_debug("应用Pro状态修改...");
        let before_len = modified_content.len();
        modified_content = modified_content.replace(
            r#"var DWr=ne("<div class=settings__item_description>You are currently signed in with <strong></strong>.");"#,
            r#"var DWr=ne("<div class=settings__item_description>You are currently signed in with <strong></strong>. <h1>Pro</h1>");"#,
        );
        if modified_content.len() != before_len {
            replacements_made += 1;
            self.log_info("Pro状态修改成功应用");
        } else {
            self.log_debug("Pro状态模式未找到匹配项");
        }

        self.log_info(&format!("总共应用了 {} 个替换", replacements_made));

        // 写回文件
        self.log_debug("写入修改后的workbench.desktop.main.js内容...");
        fs::write(workbench_path, modified_content)
            .context("Failed to write modified workbench.desktop.main.js")?;
        self.log_info("workbench.desktop.main.js文件修改完成");

        Ok(())
    }

    pub fn complete_cursor_reset(&self) -> Result<ResetResult> {
        let mut details = Vec::new();
        let mut success = true;

        // 记录系统信息和开始日志
        self.log_system_info();
        self.log_info("开始完整的 Cursor 重置流程...");
        details.push("Starting complete Cursor reset process...".to_string());

        // 第一步：重置机器ID
        self.log_info("=== 步骤 1: 重置机器ID ===");
        match self.reset_machine_ids() {
            Ok(reset_result) => {
                self.log_info(&format!(
                    "机器ID重置结果: success={}, message={}",
                    reset_result.success, reset_result.message
                ));
                for detail in &reset_result.details {
                    self.log_debug(&format!("机器ID重置详情: {}", detail));
                }
                details.extend(reset_result.details);
                if !reset_result.success {
                    success = false;
                    self.log_error("机器ID重置失败");
                } else {
                    self.log_info("机器ID重置成功");
                }
            }
            Err(e) => {
                success = false;
                let error_msg = format!("Failed to reset machine IDs: {}", e);
                self.log_error(&error_msg);
                details.push(error_msg);
            }
        }

        // 第二步：修改 main.js
        self.log_info("=== 步骤 2: 修改 main.js ===");
        match Self::get_cursor_app_paths() {
            Ok((package_json, main_js)) => {
                self.log_info(&format!(
                    "找到Cursor应用路径: package.json={:?}, main.js={:?}",
                    package_json, main_js
                ));
                self.log_info(&format!(
                    "package.json存在: {}, main.js存在: {}",
                    package_json.exists(),
                    main_js.exists()
                ));

                if package_json.exists() && main_js.exists() {
                    self.log_info("开始修改 main.js 文件...");
                    match self.modify_main_js(&main_js) {
                        Ok(()) => {
                            let success_msg = "Successfully modified main.js".to_string();
                            self.log_info(&success_msg);
                            details.push(success_msg);
                        }
                        Err(e) => {
                            let error_msg = format!("Warning: Failed to modify main.js: {}", e);
                            self.log_warning(&error_msg);
                            details.push(error_msg);
                        }
                    }
                } else {
                    let warning_msg = "Warning: Could not find Cursor main.js file".to_string();
                    self.log_warning(&warning_msg);
                    self.log_warning(&format!(
                        "详细检查: package.json路径={:?}, 存在={}",
                        package_json,
                        package_json.exists()
                    ));
                    self.log_warning(&format!(
                        "详细检查: main.js路径={:?}, 存在={}",
                        main_js,
                        main_js.exists()
                    ));
                    details.push(warning_msg);
                }
            }
            Err(e) => {
                let error_msg = format!("Warning: Could not locate Cursor installation: {}", e);
                self.log_error(&error_msg);
                details.push(error_msg);
            }
        }

        // 第三步：修改 workbench.desktop.main.js
        self.log_info("=== 步骤 3: 修改 workbench.desktop.main.js ===");
        match Self::get_workbench_js_path() {
            Ok(workbench_path) => {
                self.log_info(&format!("找到workbench路径: {:?}", workbench_path));
                self.log_info(&format!("workbench文件存在: {}", workbench_path.exists()));

                if workbench_path.exists() {
                    self.log_info("开始修改 workbench.desktop.main.js 文件...");
                    match self.modify_workbench_js(&workbench_path) {
                        Ok(()) => {
                            let success_msg =
                                "Successfully modified workbench.desktop.main.js".to_string();
                            self.log_info(&success_msg);
                            details.push(success_msg);
                        }
                        Err(e) => {
                            let error_msg = format!(
                                "Warning: Failed to modify workbench.desktop.main.js: {}",
                                e
                            );
                            self.log_warning(&error_msg);
                            details.push(error_msg);
                        }
                    }
                } else {
                    let warning_msg =
                        "Warning: Could not find workbench.desktop.main.js file".to_string();
                    self.log_warning(&warning_msg);
                    self.log_warning(&format!(
                        "详细检查: workbench路径={:?}, 存在={}",
                        workbench_path,
                        workbench_path.exists()
                    ));
                    details.push(warning_msg);
                }
            }
            Err(e) => {
                let error_msg =
                    format!("Warning: Could not locate workbench.desktop.main.js: {}", e);
                self.log_error(&error_msg);
                details.push(error_msg);
            }
        }

        let message = if success {
            "Complete Cursor reset successful".to_string()
        } else {
            "Complete Cursor reset completed with some errors".to_string()
        };

        self.log_info("=== Cursor 重置流程完成 ===");
        self.log_info(&format!("最终结果: {}", message));
        self.log_info(&format!("成功状态: {}", success));
        self.log_info(&format!("详细信息条目数: {}", details.len()));
        self.log_info(&format!("日志文件位置: {:?}", self.log_file_path));

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
