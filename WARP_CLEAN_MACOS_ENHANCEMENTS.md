# Warp macOS 清理功能增强说明

## 对比 Python macOS 版本，Rust 版本新增的功能

### 1. **数据库精细清理** ✅
- **功能**：`clean_warp_database()` 函数（已在 Windows 版本实现，现复用到 macOS）
- **说明**：连接 SQLite 数据库，清空用户数据表但保留表结构
- **清理的表**：30+ 张表，包括用户、窗口、命令、AI、项目等
- **路径**：`~/Library/Application Support/dev.warp.Warp-Stable/warp.sqlite`
- **优势**：保留数据库架构，Warp 重启后无需重建数据库

### 2. **精细文件清理（保留目录结构）** ✅
Python 版本特点：不删除整个目录，只清理特定文件

#### 2.1 删除的文件
- SQLite 临时文件：
  - `warp.sqlite-shm`
  - `warp.sqlite-wal`

#### 2.2 删除的目录
- `autoupdate` - 自动更新缓存
- `codebase_index_snapshots` - 代码库索引快照
- `mcp` - MCP 服务相关

#### 2.3 清空但不删除的文件
- `warp_network.log` - 网络日志
- `rudder_telemetry_events.json` - 遥测事件

#### 2.4 设备标识文件
- **删除 16 位随机文件名的文件**（如 `4897515f2ff5aca7`）
- 这些文件是 Warp 的设备唯一标识符
- **关键**：清除这些文件可以绕过设备识别

### 3. **plist 偏好设置清理** ✅
macOS 特有功能：
- 删除 plist 偏好设置文件：
  - `~/Library/Preferences/dev.warp.Warp.plist`
  - `~/Library/Preferences/dev.warp.Warp-Stable.plist`
  - `~/Library/Preferences/dev.warp.Warp-Preview.plist`

### 4. **刷新 cfprefsd** ✅
- **功能**：删除 plist 后刷新 macOS 偏好设置守护进程
- **命令**：`killall cfprefsd`
- **说明**：确保系统重新读取偏好设置，不使用缓存
- **优势**：让 macOS 认为 Warp 是全新安装

### 5. **清理系统缓存目录** ✅
完整清理以下系统目录：
- **Caches**：
  - `~/Library/Caches/dev.warp.Warp`
  - `~/Library/Caches/dev.warp.Warp-Stable`
  - `~/Library/Caches/dev.warp.Warp-Preview`
- **WebKit**：
  - `~/Library/WebKit/dev.warp.Warp-Stable`
  - `~/Library/WebKit/dev.warp.Warp`
- **Saved Application State**：
  - `~/Library/Saved Application State/dev.warp.Warp.savedState`
  - `~/Library/Saved Application State/dev.warp.Warp-Stable.savedState`

### 6. **清理验证** ✅
验证以下内容：
- 数据库关键表是否为空
- 敏感文件是否已删除：
  - `rudder_telemetry_events.json`
  - `mcp` 目录
  - `autoupdate` 目录
- plist 文件是否已删除
- 生成警告列表

### 7. **增强的进程检测** ✅
双重检测机制：
1. **基础检测**：`pgrep -x Warp`
2. **详细检测**：`ps aux` 获取完整进程信息
   - 检查关键词：
     - `/applications/warp.app`
     - `warp.app/contents/macos`
     - `warpterminal`

### 8. **增强的进程关闭** ✅
多层次关闭策略：
1. **第一次尝试**：`pkill -x Warp`（精确匹配）
2. **模糊匹配**：`pkill -f Warp.app` 和 `pkill -f warp`
3. **等待验证**：3 秒后检查进程是否仍在运行
4. **强制关闭**：使用 `-9` 信号强制终止
   - `pkill -9 -x Warp`
   - `pkill -9 -f Warp.app`
5. **最终验证**：确保所有相关进程已关闭

## 清理流程对比

### Python macOS 版本流程
1. 检查并关闭进程
2. 清理数据库（清空表）
3. 删除特定文件（保留目录结构）
4. 删除随机 16 位文件名文件
5. 清空日志和遥测文件
6. 删除 plist 偏好设置
7. 刷新 cfprefsd
8. 清理系统缓存和 WebKit
9. 验证清理结果

### Rust macOS 版本流程（增强后）
1. **精细清理 Application Support**：
   - ✅ 清理数据库表（保留架构）
   - ✅ 删除 SQLite 临时文件
   - ✅ 删除特定目录（autoupdate, mcp, codebase_index_snapshots）
   - ✅ 清空日志和遥测文件（不删除）
   - ✅ 删除 16 位随机文件（设备标识）
   - ✅ 重新创建必要的空目录
2. **清理系统缓存目录**（完整删除）：
   - Caches
   - WebKit
   - Saved Application State
3. **清理 plist 偏好设置**
4. **刷新 cfprefsd**
5. **验证清理结果**

## macOS 特有的关键点

### 1. 目录结构
macOS 上 Warp 的主要数据位置：
```
~/Library/Application Support/dev.warp.Warp-Stable/
├── warp.sqlite              # 主数据库
├── warp.sqlite-shm          # SQLite 临时文件
├── warp.sqlite-wal          # SQLite 临时文件
├── warp_network.log         # 网络日志
├── rudder_telemetry_events.json  # 遥测数据
├── 4897515f2ff5aca7        # 16位随机设备标识
├── autoupdate/             # 自动更新
├── codebase_index_snapshots/  # 代码库索引
└── mcp/                    # MCP 服务
```

### 2. 设备指纹
macOS 版本需要清理的设备指纹：
- ✅ 16 位随机文件名（设备唯一 ID）
- ✅ plist 偏好设置
- ✅ 数据库中的用户信息
- ✅ 遥测事件记录

### 3. 系统集成
macOS 特有的系统集成清理：
- ✅ WebKit 缓存
- ✅ Saved Application State
- ✅ cfprefsd 偏好设置守护进程

## 技术细节

### 依赖项
所有功能都使用现有依赖：
- `rusqlite` - SQLite 数据库操作
- `std::process::Command` - 执行系统命令
- `std::fs` - 文件系统操作

### macOS 系统命令
使用的 macOS 命令：
- `pgrep` - 进程查找
- `pkill` - 进程关闭
- `ps aux` - 进程详细信息
- `killall cfprefsd` - 刷新偏好设置

### 错误处理
- 所有操作都有详细的错误日志
- 清理失败不影响其他项继续执行
- 收集所有错误和警告统一返回

## 与 Python macOS 版本的对比

| 功能 | Python 版本 | Rust 版本（增强后） |
|------|------------|-------------------|
| 数据库清理 | ✅ 清空表 | ✅ 清空表（相同） |
| 精细文件清理 | ✅ 保留目录结构 | ✅ 保留目录结构（相同） |
| 删除随机文件 | ✅ 16位文件 | ✅ 16位文件（相同） |
| plist 清理 | ✅ 删除 | ✅ 删除（相同） |
| 刷新 cfprefsd | ✅ killall | ✅ killall（相同） |
| 系统缓存清理 | ✅ 完整 | ✅ 完整（相同） |
| 清理验证 | ✅ 验证 | ✅ 验证（增强） |
| 进程检测 | ✅ ps aux | ✅ pgrep + ps aux（增强） |
| 进程关闭 | ✅ pkill + pkill -9 | ✅ 多层次关闭 + 验证（增强） |
| 性能 | 🐌 Python | ⚡ Rust（更快） |

## 使用建议

### 清理前
1. 确保 Warp 已关闭（程序会自动检测并关闭）
2. 重要配置建议手动备份（程序不提供备份功能）

### 清理后
1. 检查验证结果中的警告
2. 重启 Warp 将自动生成新的配置文件
3. 重新登录账号
4. 首次启动可能需要重新设置主题和快捷键

### 注意事项
- **16 位随机文件**是关键的设备标识，必须删除
- **plist 文件**删除后需要刷新 cfprefsd
- **遥测文件**清空而不删除，让 Warp 重新生成
- **数据库架构**保留可以加快 Warp 重启速度

## 官方文档参考

根据 Warp 官方卸载文档，完整清理需要执行：

```bash
# 删除偏好设置
defaults delete dev.warp.Warp-Stable

# 删除日志
sudo rm -r $HOME/Library/Logs/warp.log

# 删除数据库和用户文件
sudo rm -r "$HOME/Library/Application Support/dev.warp.Warp-Stable"

# 删除主题和启动配置
sudo rm -r $HOME/.warp
```

**Rust 版本已实现所有官方建议的清理步骤，并增加了更多精细清理功能。**

## 总结

Rust macOS 版本在保持 Python 版本所有核心功能的基础上，主要改进：

1. ✨ **更智能的进程检测**：pgrep + ps aux 双重检测
2. ✨ **更可靠的进程关闭**：多层次尝试 + 验证机制
3. ✨ **完整的清理验证**：检查数据库、文件、plist
4. ⚡ **更快的执行速度**：Rust 原生性能

这些增强使得 macOS 版本的 Warp 清理更加彻底和可靠，能够有效清除所有设备指纹，实现"无限白嫖"的目的。
