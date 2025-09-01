#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打包Python项目为可执行文件
支持Windows、macOS、Linux
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def get_platform_info():
    """获取平台信息"""
    if sys.platform.startswith('win'):
        return 'windows', '.exe'
    elif sys.platform.startswith('darwin'):
        return 'macos', ''
    elif sys.platform.startswith('linux'):
        return 'linux', ''
    else:
        return 'unknown', ''

def build_executable():
    """使用PyInstaller打包可执行文件"""
    platform, ext = get_platform_info()
    
    print(f"🚀 开始为 {platform} 平台打包可执行文件...")
    
    # 获取当前目录
    current_dir = Path(__file__).parent
    build_dir = current_dir.parent / "pyBuild"
    
    # 清理并创建build目录
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(exist_ok=True)
    
    # 创建平台特定目录
    platform_dir = build_dir / platform
    platform_dir.mkdir(exist_ok=True)
    
    print(f"📁 构建目录: {platform_dir}")
    
    # 激活虚拟环境并安装PyInstaller
    venv_python = current_dir / "venv" / "bin" / "python"
    if platform == 'windows':
        venv_python = current_dir / "venv" / "Scripts" / "python.exe"
    
    if not venv_python.exists():
        print("❌ 虚拟环境不存在，请先创建虚拟环境并安装依赖")
        return False
    
    # 安装PyInstaller
    print("📦 安装PyInstaller...")
    result = subprocess.run([
        str(venv_python), "-m", "pip", "install", "pyinstaller"
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ 安装PyInstaller失败: {result.stderr}")
        return False
    
    # 创建入口脚本
    entry_script = current_dir / "cursor_register_entry.py"
    entry_content = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cursor注册程序入口点
"""

import sys
import json
import os
from pathlib import Path

# 添加当前目录到path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# 设置显示环境
os.environ.setdefault('DISPLAY', ':0')

def main():
    """主函数"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "缺少参数，用法: cursor_register <email> [first_name] [last_name]"
        }))
        sys.exit(1)

    email = sys.argv[1]
    first_name = sys.argv[2] if len(sys.argv) > 2 else "Auto"
    last_name = sys.argv[3] if len(sys.argv) > 3 else "Generated"
    use_incognito = sys.argv[4] if len(sys.argv) > 4 else "true"

    try:
        # 导入manual_register模块并执行
        from manual_register import main as manual_main

        # 临时修改sys.argv来传递参数
        original_argv = sys.argv[:]
        sys.argv = ["manual_register.py", email, first_name, last_name, use_incognito]

        try:
            manual_main()
        finally:
            # 恢复原始argv
            sys.argv = original_argv

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"注册过程出错: {str(e)}"
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
'''
    
    entry_script.write_text(entry_content, encoding='utf-8')
    
    # PyInstaller命令
    exe_name = f"cursor_register{ext}"

    pyinstaller_cmd = [
        str(venv_python), "-m", "PyInstaller",
        "--onefile",  # 单文件模式
        "--console",  # 显示控制台窗口（用于调试）
        "--name", "cursor_register",
        "--distpath", str(platform_dir),
        "--workpath", str(current_dir / "build"),
        "--specpath", str(current_dir),
        # 添加隐藏导入
        "--hidden-import", "manual_register",
        "--hidden-import", "cursor_register_manual",
        "--hidden-import", "new_signup",
        "--hidden-import", "cursor_auth",
        "--hidden-import", "reset_machine_manual",
        "--hidden-import", "get_user_token",
        "--hidden-import", "account_manager",
        "--hidden-import", "config",
        "--hidden-import", "utils",
        "--hidden-import", "email_tabs.email_tab_interface",
        "--hidden-import", "email_tabs.tempmail_plus_tab",
        # 添加数据文件
        "--add-data", f"{current_dir}/*.py{os.pathsep}.",
        "--add-data", f"{current_dir}/email_tabs{os.pathsep}email_tabs",
        str(entry_script)
    ]
    
    print("🔨 开始打包...")
    print(f"命令: {' '.join(pyinstaller_cmd)}")
    
    result = subprocess.run(pyinstaller_cmd, 
                           cwd=str(current_dir),
                           capture_output=True, 
                           text=True)
    
    if result.returncode == 0:
        exe_path = platform_dir / exe_name
        if exe_path.exists():
            print(f"✅ 打包成功!")
            print(f"📦 可执行文件: {exe_path}")
            print(f"📏 文件大小: {exe_path.stat().st_size / 1024 / 1024:.1f} MB")
            
            # 清理临时文件
            cleanup_files = [
                current_dir / "cursor_register.spec",
                current_dir / "build",
                entry_script
            ]
            
            for file_path in cleanup_files:
                if file_path.exists():
                    if file_path.is_dir():
                        shutil.rmtree(file_path)
                    else:
                        file_path.unlink()
            
            return True
        else:
            print(f"❌ 可执行文件未生成: {exe_path}")
            return False
    else:
        print(f"❌ 打包失败:")
        print(f"stdout: {result.stdout}")
        print(f"stderr: {result.stderr}")
        return False

def create_readme():
    """创建README文件"""
    platform, ext = get_platform_info()
    build_dir = Path(__file__).parent.parent / "pyBuild"
    
    readme_content = f"""# Cursor自动注册 - 可执行文件

## 📦 打包信息
- 平台: {platform}
- 可执行文件: cursor_register{ext}
- 打包时间: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 🚀 使用方法

```bash
# 基本用法
./cursor_register{ext} test@example.com John Smith

# 或者只提供邮箱（会生成随机姓名）
./cursor_register{ext} test@example.com
```

## 📊 响应格式

成功:
```json
{{"success": true, "email": "test@example.com", "message": "注册成功"}}
```

失败:
```json
{{"success": false, "error": "错误信息"}}
```

## ⚠️ 注意事项

1. 需要Chrome/Chromium浏览器
2. 需要稳定的网络连接
3. 首次运行可能需要较长时间加载
"""
    
    readme_path = build_dir / platform / "README.md"
    readme_path.write_text(readme_content, encoding='utf-8')
    print(f"📝 README已创建: {readme_path}")

if __name__ == "__main__":
    if build_executable():
        create_readme()
        print("🎉 打包完成!")
    else:
        print("❌ 打包失败!")
        sys.exit(1)
