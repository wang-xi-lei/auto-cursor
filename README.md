# Cursor 机器ID 恢复工具

一个基于 Tauri 2 构建的桌面应用程序，用于恢复 Cursor 编辑器的机器标识备份。

## 功能特性

- 🔍 自动检测 Cursor 编辑器安装
- 💾 扫描和列出可用的机器ID备份文件
- 👁️ 预览备份中的机器ID信息
- 🔄 一键恢复机器ID设置
- 🛡️ 自动创建当前配置的备份
- 🎯 跨平台支持 (Windows, macOS, Linux)
- 🔐 安全的系统级ID更新

## 系统要求

- Node.js 18+ 
- Rust 1.70+
- pnpm 或 npm
- Cursor 编辑器已安装

## 安装和运行

### 开发环境

1. 克隆仓库并安装依赖：
```bash
cd auto-cursor
pnpm install
```

2. 启动开发服务器：
```bash
pnpm tauri dev
```

### 构建应用

```bash
pnpm tauri build
```

## 使用说明

### 1. 检查 Cursor 安装
应用启动时会自动检测系统中的 Cursor 编辑器安装。如果未检测到，会显示相应提示。

### 2. 选择备份文件
在主界面中，应用会列出所有可用的机器ID备份文件，包括：
- 文件名
- 创建日期
- 文件大小

### 3. 预览机器ID
选择备份文件后，可以预览其中包含的机器ID信息：
- `telemetry.devDeviceId`
- `telemetry.macMachineId` 
- `telemetry.machineId`
- `telemetry.sqmId`
- `storage.serviceMachineId`

### 4. 确认恢复
确认要恢复的机器ID后，应用会：
- 创建当前配置的备份
- 更新 storage.json 文件
- 更新 SQLite 数据库
- 更新 machineId 文件
- 更新系统级标识（如果有权限）

### 5. 完成恢复
恢复完成后，需要：
- 关闭 Cursor 编辑器
- 重新启动 Cursor 编辑器
- 检查编辑器是否正常工作

## 技术架构

### 前端 (React + TypeScript)
- 现代化的 React UI 界面
- TypeScript 类型安全
- Tailwind CSS 样式框架
- 响应式设计

### 后端 (Rust + Tauri)
- Rust 高性能后端
- Tauri 2 桌面应用框架
- SQLite 数据库操作
- 跨平台文件系统访问
- 系统级权限操作

### 支持的平台

#### Windows
- 注册表操作 (MachineGuid, SQMClient)
- APPDATA 路径支持

#### macOS  
- plist 文件操作
- Application Support 路径支持
- sudo 权限处理

#### Linux
- .config 路径支持
- 基础文件操作

## 文件路径

### Windows
- 存储文件: `%APPDATA%\Cursor\User\globalStorage\storage.json`
- 数据库: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
- 机器ID: `%APPDATA%\Cursor\machineId`

### macOS
- 存储文件: `~/Library/Application Support/Cursor/User/globalStorage/storage.json`
- 数据库: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- 机器ID: `~/Library/Application Support/Cursor/machineId`

### Linux
- 存储文件: `~/.config/Cursor/User/globalStorage/storage.json`
- 数据库: `~/.config/Cursor/User/globalStorage/state.vscdb`
- 机器ID: `~/.config/Cursor/machineId`

## 安全说明

- 应用只读取和修改 Cursor 相关的配置文件
- 系统级操作需要相应权限
- 所有操作前都会创建备份
- 不会收集或上传任何用户数据

## 常见问题

### Q: 为什么需要管理员权限？
A: 某些系统级ID更新（如Windows注册表、macOS系统配置）需要提升权限。

### Q: 恢复失败怎么办？
A: 应用会显示详细的错误信息，并且已创建的备份可以用于手动恢复。

### Q: 支持哪些备份文件格式？
A: 支持标准的 JSON 格式备份文件，文件名格式为 `storage.json.bak.YYYYMMDD_HHMMSS`。

## 开发

### 项目结构
```
auto-cursor/
├── src/                    # React 前端源码
├── src-tauri/             # Rust 后端源码
│   ├── src/
│   │   ├── lib.rs         # 主入口
│   │   └── machine_id.rs  # 机器ID处理模块
│   ├── Cargo.toml         # Rust 依赖
│   └── tauri.conf.json    # Tauri 配置
├── package.json           # Node.js 依赖
└── tailwind.config.js     # Tailwind 配置
```

### 添加新功能
1. 后端：在 `src-tauri/src/` 中添加新的 Rust 模块
2. 前端：在 `src/` 中添加新的 React 组件
3. 配置：更新 `tauri.conf.json` 中的权限设置

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
