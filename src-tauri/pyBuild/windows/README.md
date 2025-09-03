# Cursor自动注册 - 可执行文件

## 📦 打包信息
- 平台: windows
- 可执行文件: cursor_register.exe
- 打包时间: 2025-09-03 21:42:18

## 🚀 使用方法

```bash
# 基本用法
./cursor_register.exe test@example.com John Smith

# 或者只提供邮箱（会生成随机姓名）
./cursor_register.exe test@example.com
```

## 📊 响应格式

成功:
```json
{"success": true, "email": "test@example.com", "message": "注册成功"}
```

失败:
```json
{"success": false, "error": "错误信息"}
```

## ⚠️ 注意事项

1. 需要Chrome/Chromium浏览器
2. 需要稳定的网络连接
3. 首次运行可能需要较长时间加载
