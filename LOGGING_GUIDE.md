# Cursor 重置日志记录功能说明

## 概述

我已经为 Cursor 重置功能添加了详细的日志记录系统，可以帮助你诊断切换账号时遇到的问题。

## 主要功能

### 1. 自动日志记录
- 每次运行 Cursor 重置时，会自动创建一个带时间戳的日志文件
- 日志文件位置：工作目录下的 `cursor_reset_YYYYMMDD_HHMMSS.log`
- 同时在控制台和文件中记录详细信息

### 2. 详细的系统信息记录
- 操作系统信息
- 当前用户信息
- Cursor 安装路径检查
- 文件存在性验证

### 3. 步骤级别的详细日志
- 机器ID重置的每个步骤
- 文件修改操作的详细记录
- 错误信息的完整记录
- 成功/失败状态跟踪

## 日志级别

- **INFO**: 一般信息和成功操作
- **WARN**: 警告信息（不会导致失败但需要注意）
- **ERROR**: 错误信息（会导致操作失败）
- **DEBUG**: 调试信息（详细的操作过程）

## 使用方法

### 通过前端调用
```javascript
// 获取日志文件路径
const logPath = await invoke('get_log_file_path');
console.log('日志文件位置:', logPath);

// 测试日志记录功能
const testResult = await invoke('test_logging');
console.log('测试结果:', testResult);

// 执行完整的 Cursor 重置（会自动记录日志）
const resetResult = await invoke('complete_cursor_reset');
```

### 日志文件示例
```
[2024-01-15 14:30:15.123] [INFO] === 系统信息 ===
[2024-01-15 14:30:15.124] [INFO] 操作系统: macos
[2024-01-15 14:30:15.125] [INFO] 架构: aarch64
[2024-01-15 14:30:15.126] [INFO] 工作目录: "/Users/username/Desktop/project"
[2024-01-15 14:30:15.127] [INFO] 存储文件路径: "/Users/username/Library/Application Support/Cursor/User/globalStorage/storage.json"
[2024-01-15 14:30:15.128] [INFO] SQLite路径: "/Users/username/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
[2024-01-15 14:30:15.129] [INFO] 日志文件路径: "/Users/username/Desktop/project/cursor_reset_20240115_143015.log"
[2024-01-15 14:30:15.130] [INFO] 存储文件是否存在: true
[2024-01-15 14:30:15.131] [INFO] SQLite文件是否存在: true
[2024-01-15 14:30:15.132] [INFO] 当前用户: username
[2024-01-15 14:30:15.133] [INFO] === 系统信息结束 ===
[2024-01-15 14:30:15.134] [INFO] 开始完整的 Cursor 重置流程...
[2024-01-15 14:30:15.135] [INFO] === 步骤 1: 重置机器ID ===
[2024-01-15 14:30:15.136] [INFO] 开始机器ID重置流程...
[2024-01-15 14:30:15.137] [DEBUG] 检查存储文件: "/Users/username/Library/Application Support/Cursor/User/globalStorage/storage.json"
[2024-01-15 14:30:15.138] [INFO] 存储文件存在，继续处理
[2024-01-15 14:30:15.139] [INFO] 创建备份文件...
[2024-01-15 14:30:15.140] [INFO] Created backup at: /Users/username/Library/Application Support/Cursor/User/globalStorage/storage.json.bak.20240115_143015
[2024-01-15 14:30:15.141] [INFO] 生成新的机器ID...
[2024-01-15 14:30:15.142] [INFO] 生成的新ID: dev_device_id=abc123-def456-ghi789, machine_id长度=64, mac_machine_id长度=128, sqm_id={ABC123-DEF456-GHI789}
[2024-01-15 14:30:15.143] [INFO] 更新存储文件...
[2024-01-15 14:30:15.144] [INFO] Successfully updated storage.json
[2024-01-15 14:30:15.145] [INFO] 更新SQLite数据库...
[2024-01-15 14:30:15.146] [DEBUG] SQLite更新结果: SQLite database update skipped (feature not implemented)
[2024-01-15 14:30:15.147] [INFO] 更新机器ID文件...
[2024-01-15 14:30:15.148] [INFO] Successfully updated machine ID file
[2024-01-15 14:30:15.149] [INFO] 更新系统ID...
[2024-01-15 14:30:15.150] [DEBUG] 系统ID更新结果: macOS platform UUID updated successfully
[2024-01-15 14:30:15.151] [INFO] 机器ID重置完成: Machine IDs reset successfully
[2024-01-15 14:30:15.152] [INFO] === 步骤 2: 修改 main.js ===
[2024-01-15 14:30:15.153] [INFO] 找到Cursor应用路径: package.json="/Applications/Cursor.app/Contents/Resources/app/package.json", main.js="/Applications/Cursor.app/Contents/Resources/app/out/main.js"
[2024-01-15 14:30:15.154] [INFO] package.json存在: true, main.js存在: true
[2024-01-15 14:30:15.155] [INFO] 开始修改 main.js 文件...
[2024-01-15 14:30:15.156] [INFO] 开始修改main.js文件: "/Applications/Cursor.app/Contents/Resources/app/out/main.js"
[2024-01-15 14:30:15.157] [DEBUG] 读取main.js文件内容...
[2024-01-15 14:30:15.158] [INFO] main.js文件大小: 1234567 字节
[2024-01-15 14:30:15.159] [INFO] 创建main.js备份: /Applications/Cursor.app/Contents/Resources/app/out/main.js.backup.20240115_143015
[2024-01-15 14:30:15.160] [DEBUG] 应用模式 1: async getMachineId\(\)\{return [^??]+\?\?([^}]+)\}
[2024-01-15 14:30:15.161] [INFO] 模式 1 已应用，内容长度从 1234567 变为 1234500
[2024-01-15 14:30:15.162] [DEBUG] 应用模式 2: async getMacMachineId\(\)\{return [^??]+\?\?([^}]+)\}
[2024-01-15 14:30:15.163] [INFO] 模式 2 已应用，内容长度从 1234500 变为 1234433
[2024-01-15 14:30:15.164] [INFO] 总共应用了 2 个模式
[2024-01-15 14:30:15.165] [DEBUG] 写入修改后的main.js内容...
[2024-01-15 14:30:15.166] [INFO] main.js文件修改完成
[2024-01-15 14:30:15.167] [INFO] Successfully modified main.js
[2024-01-15 14:30:15.168] [INFO] === 步骤 3: 修改 workbench.desktop.main.js ===
[2024-01-15 14:30:15.169] [INFO] 找到workbench路径: "/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js"
[2024-01-15 14:30:15.170] [INFO] workbench文件存在: true
[2024-01-15 14:30:15.171] [INFO] 开始修改 workbench.desktop.main.js 文件...
[2024-01-15 14:30:15.172] [INFO] 开始修改workbench.desktop.main.js文件: "/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js"
[2024-01-15 14:30:15.173] [DEBUG] 读取workbench.desktop.main.js文件内容...
[2024-01-15 14:30:15.174] [INFO] workbench.desktop.main.js文件大小: 9876543 字节
[2024-01-15 14:30:15.175] [INFO] 创建workbench.desktop.main.js备份: /Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js.backup.20240115_143015
[2024-01-15 14:30:15.176] [INFO] 当前平台: macos, 使用对应的按钮模式
[2024-01-15 14:30:15.177] [DEBUG] 应用按钮替换...
[2024-01-15 14:30:15.178] [INFO] 按钮替换成功应用
[2024-01-15 14:30:15.179] [DEBUG] 应用徽章替换...
[2024-01-15 14:30:15.180] [INFO] 徽章替换成功应用
[2024-01-15 14:30:15.181] [DEBUG] 应用通知隐藏...
[2024-01-15 14:30:15.182] [INFO] 通知隐藏成功应用
[2024-01-15 14:30:15.183] [DEBUG] 应用Token限制绕过...
[2024-01-15 14:30:15.184] [INFO] Token限制绕过成功应用
[2024-01-15 14:30:15.185] [DEBUG] 应用Pro状态修改...
[2024-01-15 14:30:15.186] [INFO] Pro状态修改成功应用
[2024-01-15 14:30:15.187] [INFO] 总共应用了 5 个替换
[2024-01-15 14:30:15.188] [DEBUG] 写入修改后的workbench.desktop.main.js内容...
[2024-01-15 14:30:15.189] [INFO] workbench.desktop.main.js文件修改完成
[2024-01-15 14:30:15.190] [INFO] Successfully modified workbench.desktop.main.js
[2024-01-15 14:30:15.191] [INFO] === Cursor 重置流程完成 ===
[2024-01-15 14:30:15.192] [INFO] 最终结果: Complete Cursor reset successful
[2024-01-15 14:30:15.193] [INFO] 成功状态: true
[2024-01-15 14:30:15.194] [INFO] 详细信息条目数: 15
[2024-01-15 14:30:15.195] [INFO] 日志文件位置: "/Users/username/Desktop/project/cursor_reset_20240115_143015.log"
```

## 故障排除

当你遇到 "Complete Cursor reset completed with some errors" 错误时：

1. **查看日志文件**：在工作目录中找到最新的 `cursor_reset_YYYYMMDD_HHMMSS.log` 文件
2. **检查系统信息**：确认 Cursor 安装路径是否正确
3. **查看具体错误**：搜索日志中的 `[ERROR]` 和 `[WARN]` 条目
4. **检查文件权限**：确保有足够的权限修改 Cursor 文件
5. **查看备份文件**：所有修改的文件都会自动创建备份

## 常见问题及解决方案

### 1. 找不到 Cursor 安装路径
```
[ERROR] Warning: Could not locate Cursor installation: Could not find Cursor installation
```
**解决方案**：检查 Cursor 是否正确安装在默认位置

### 2. 文件权限问题
```
[ERROR] Failed to update storage file: Permission denied
```
**解决方案**：以管理员权限运行程序

### 3. 文件不存在
```
[ERROR] Storage file not found: /path/to/storage.json
```
**解决方案**：确保 Cursor 已经运行过至少一次，生成了配置文件

## 新增的前端接口

1. `get_log_file_path()`: 获取当前日志文件路径
2. `test_logging()`: 测试日志记录功能
3. `complete_cursor_reset()`: 执行完整重置（现在包含详细日志）

通过这些详细的日志记录，你现在可以准确地诊断切换账号时遇到的任何问题！
