# Cursor 自动注册功能

## 概述

本功能将Python的Cursor自动注册功能移植到Rust中，使用WebDriver进行浏览器自动化操作。

## 功能特性

- ✅ 自动填写注册表单
- ✅ 处理Turnstile验证（尽力而为）
- ✅ 密码设置
- ✅ 验证码处理（支持手动输入）
- ✅ 账户信息获取和保存
- ✅ 支持headless和显示模式

## 前置要求

### 1. 安装WebDriver

在macOS上：
```bash
# 安装Chrome和ChromeDriver
brew install --cask google-chrome
brew install chromedriver

# 或者安装Firefox和GeckoDriver
brew install --cask firefox
brew install geckodriver
```

在其他系统上，请手动下载对应的WebDriver。

### 2. 启动WebDriver服务

使用前需要先启动WebDriver服务：

```bash
# Chrome
chromedriver --port=9515

# 或者Firefox
geckodriver --port=4444
```

## API 使用说明

### 1. 注册新账户

```rust
use auto_cursor::AutoRegister;

// 创建自动注册实例
let mut auto_register = AutoRegister::new(); // 显示浏览器
// 或者
let mut auto_register = AutoRegister::new_headless(); // 无头模式

// 注册账户
let result = auto_register.register_account(
    "user@example.com".to_string(),
    "John".to_string(),
    "Doe".to_string(),
    "SecurePassword123!".to_string()
).await?;

if result.success {
    println!("注册成功: {}", result.message);
} else {
    println!("注册失败: {}", result.message);
}

// 关闭浏览器
auto_register.close_browser().await;
```

### 2. Tauri 命令

```typescript
// 前端调用
import { invoke } from '@tauri-apps/api/tauri';

// 注册账户
const result = await invoke('register_cursor_account', {
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  password: 'SecurePassword123!'
});

// 获取保存的账户
const accounts = await invoke('get_saved_accounts');

// 输入验证码（待实现）
const codeResult = await invoke('input_verification_code_for_registration', {
  code: '123456'
});
```

## 注册流程

1. **启动浏览器** - 启动WebDriver客户端
2. **访问注册页面** - 导航到Cursor注册页面
3. **填写表单** - 自动填写姓名、邮箱
4. **提交表单** - 点击提交按钮
5. **处理Turnstile** - 尝试处理第一次验证
6. **设置密码** - 填写并提交密码
7. **处理验证** - 再次处理Turnstile验证
8. **验证码处理** - 等待用户手动输入验证码
9. **获取账户信息** - 从设置页面获取token和使用量
10. **保存账户** - 将账户信息保存到本地文件

## 验证码处理

目前验证码需要手动输入。系统会：

1. 显示提示信息，要求用户查看邮箱
2. 等待用户在浏览器中手动输入验证码
3. 检测页面跳转来确认验证成功

## 账户信息存储

注册成功的账户信息会保存到：
- macOS: `~/.cursor_accounts/accounts.json`
- Windows: `%USERPROFILE%\.cursor_accounts\accounts.json`
- Linux: `~/.cursor_accounts/accounts.json`

存储格式：
```json
[
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "token": "eyJ...",
    "usage": "Free Plan",
    "created_at": "2024-01-15T10:30:00Z",
    "status": "active"
  }
]
```

## 故障排除

### 常见错误

1. **WebDriver连接失败**
   - 确保chromedriver或geckodriver正在运行
   - 检查端口是否正确（Chrome: 9515, Firefox: 4444）

2. **元素找不到**
   - Cursor网站可能已更新，需要更新选择器
   - 网络延迟导致页面加载慢，可以增加等待时间

3. **Turnstile验证失败**
   - 这是正常现象，Turnstile设计用于阻止自动化
   - 可以尝试手动点击验证框

### 调试模式

启用详细日志：
```bash
RUST_LOG=debug cargo run
```

## 限制

- 验证码需要手动输入
- Turnstile验证可能不稳定
- 依赖外部WebDriver服务
- 网站结构变化可能导致失败

## 未来改进

- [ ] 集成邮箱API自动获取验证码
- [ ] 改进Turnstile处理机制
- [ ] 添加更多浏览器支持
- [ ] 实现验证码识别
- [ ] 添加代理支持

## 安全注意事项

- 密码会明文存储在本地文件中，请确保文件权限安全
- 建议使用专门的测试邮箱
- 不要在生产环境中滥用此功能
- 遵守Cursor的服务条款
