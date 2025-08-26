# Auto-Cursor 账号切换功能改进指南

## 🎯 改进内容

基于CursorPool_Client项目的完整实现，我已经为你的auto-cursor项目添加了完整的账号切换功能。

## 🔧 核心改进

### 1. 后端改进 (Rust)

#### 新增函数：
- `switch_account_with_token()` - 支持直接使用邮箱和token切换
- `inject_token_to_sqlite_with_auth_type()` - 支持自定义认证类型
- 改进的 `inject_email_to_sqlite()` 和 `inject_token_to_sqlite()` 函数

#### 关键数据库字段更新：
```rust
let auth_fields = vec![
    ("cursorAuth/accessToken", processed_token),
    ("cursorAuth/refreshToken", processed_token),    // refreshToken = accessToken
    ("cursor.accessToken", processed_token),         // 额外的token字段
    ("cursorAuth/cachedSignUpType", auth_type),      // 认证类型 - 关键！
];

let email_fields = vec![
    ("cursorAuth/cachedEmail", email),  // 主要邮箱字段
    ("cursor.email", email),            // 额外的邮箱字段
];
```

#### Token处理逻辑：
```rust
// 处理包含分隔符的token
let processed_token = if token.contains("%3A%3A") {
    token.split("%3A%3A").nth(1).unwrap_or(token)
} else if token.contains("::") {
    token.split("::").nth(1).unwrap_or(token)
} else {
    token
};
```

### 2. 前端改进 (TypeScript/React)

#### 新增服务方法：
```typescript
// 直接使用邮箱和token切换账号
static async switchAccountWithToken(
  email: string, 
  token: string, 
  authType?: string
): Promise<SwitchAccountResult>
```

#### 新增UI功能：
- 🚀 **快速切换** 按钮和表单
- 支持选择认证类型 (Auth_0/Google/GitHub)
- 更好的用户体验和错误提示

## 🚀 使用方法

### 方法1：快速切换 (推荐)
1. 点击 "🚀 快速切换" 按钮
2. 输入邮箱和token
3. 选择认证类型 (默认Auth_0)
4. 点击 "🚀 立即切换"
5. 重启Cursor查看效果

### 方法2：传统方式
1. 先添加账户到列表
2. 从列表中选择账户切换

## 🔍 关键发现

### RefreshToken的真相：
- **RefreshToken实际上就是AccessToken** - 它们是同一个JWT token
- CursorPool_Client项目中，两个字段存储的是相同的值
- 这解释了为什么你之前只更新token但Cursor仍显示未登录

### 必须更新的数据库字段：
1. `cursorAuth/cachedEmail` - **最重要**，Cursor识别登录状态的关键
2. `cursorAuth/accessToken` - 访问令牌
3. `cursorAuth/refreshToken` - 刷新令牌 (与accessToken相同)
4. `cursorAuth/cachedSignUpType` - 认证类型 (Auth_0/Google/GitHub)
5. `cursor.email` - 额外的邮箱字段
6. `cursor.accessToken` - 额外的token字段

## 🛠️ 编译和运行

```bash
# 进入项目目录
cd auto-cursor

# 安装依赖
npm install

# 开发模式运行
npm run tauri dev

# 构建生产版本
npm run tauri build
```

## 🐛 故障排除

### 如果切换后仍显示未登录：
1. 检查token格式是否正确
2. 确认所有数据库字段都已更新
3. 重启Cursor应用
4. 检查Cursor数据库路径是否正确

### 常见Token格式：
- 完整格式: `user_01XXXXXXX%3A%3AeyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...`
- 处理后: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT格式)

## 📝 测试建议

1. 使用有效的Cursor账号token进行测试
2. 在切换前备份Cursor配置
3. 测试不同的认证类型
4. 验证切换后的登录状态

## 🔥 最新关键改进 (解决认证问题)

基于对CursorPool_Client的深入分析，我发现了导致"ERROR_NOT_LOGGED_IN"错误的根本原因，并添加了以下**关键功能**：

### 1. **强制关闭Cursor进程** ⭐⭐⭐
```rust
// 在切换账号前强制关闭Cursor - 这是关键！
if Self::is_cursor_running() {
    Self::force_close_cursor()?;
}
```

**为什么重要**：Cursor在运行时会缓存认证状态，必须完全关闭才能重新读取数据库中的新认证信息。

### 2. **跨平台进程管理**
- Windows: `taskkill /F /IM Cursor.exe`
- macOS: `pkill -f Cursor`
- Linux: `pkill -f cursor`

### 3. **数据库更新等待时间**
```rust
// 等待数据库更新完成 - 确保写入完成
std::thread::sleep(std::time::Duration::from_millis(500));
```

### 4. **移除有问题的PRAGMA语句**
移除了导致"Execute returned results"错误的PRAGMA语句，这些语句在某些SQLite版本中会有兼容性问题。

## 🚀 使用新功能

### 完整的账号切换流程：
1. **检测Cursor进程** - 自动检测Cursor是否在运行
2. **强制关闭** - 如果运行则强制关闭所有Cursor进程
3. **更新数据库** - 写入新的认证信息到所有必要字段
4. **等待完成** - 确保数据库写入完全完成
5. **手动重启Cursor** - 用户需要手动重启Cursor以加载新认证

### 重要提示：
⚠️ **切换账号后必须手动重启Cursor** - 这是正常流程，CursorPool_Client也是这样工作的。

## 🎉 总结

现在你的auto-cursor项目具备了与CursorPool_Client**完全相同**的账号切换功能：

- ✅ 完整的数据库字段更新
- ✅ 正确的token处理逻辑
- ✅ 支持多种认证类型
- ✅ **强制关闭Cursor进程** (关键!)
- ✅ **跨平台进程管理**
- ✅ **数据库更新等待机制**
- ✅ 用户友好的界面
- ✅ 事务安全的数据库操作
- ✅ 详细的调试日志

这应该能**彻底解决**你遇到的"ERROR_NOT_LOGGED_IN"问题！🎯
