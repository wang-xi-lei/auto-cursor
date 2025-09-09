import os
import sys
import json
from colorama import Fore, Style, init
import time
import random
from faker import Faker

# 强制刷新输出，确保实时显示
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
from cursor_auth import CursorAuth
from reset_machine_manual import MachineIDResetter
from get_user_token import get_token_from_cookie
from config import get_config
from account_manager import AccountManager

os.environ["PYTHONVERBOSE"] = "0"
os.environ["PYINSTALLER_VERBOSE"] = "0"

# Initialize colorama
init()

def safe_print(*args, **kwargs):
    """Safe print function that handles BrokenPipeError"""
    try:
        print(*args, **kwargs)
        sys.stdout.flush()
    except BrokenPipeError:
        # Pipe has been closed, exit gracefully
        sys.exit(0)
    except Exception:
        # Ignore other print errors
        pass

# Define emoji constants
EMOJI = {
    'START': '🚀',
    'FORM': '📝',
    'VERIFY': '🔄',
    'PASSWORD': '🔑',
    'CODE': '📱',
    'DONE': '✨',
    'ERROR': '❌',
    'WAIT': '⏳',
    'SUCCESS': '✅',
    'MAIL': '📧',
    'KEY': '🔐',
    'UPDATE': '🔄',
    'INFO': 'ℹ️'
}

def get_random_wait_time(config, timing_type='page_load_wait'):
    """
    Get random wait time from config
    Args:
        config: ConfigParser object
        timing_type: Type of timing to get (page_load_wait, input_wait, submit_wait)
    Returns:
        float: Random wait time or fixed time
    """
    try:
        if not config.has_section('Timing'):
            return random.uniform(0.1, 0.8)  # Default value

        if timing_type == 'random':
            min_time = float(config.get('Timing', 'min_random_time', fallback='0.1'))
            max_time = float(config.get('Timing', 'max_random_time', fallback='0.8'))
            return random.uniform(min_time, max_time)

        time_value = config.get('Timing', timing_type, fallback='0.1-0.8')

        # Check if it's a fixed time value
        if '-' not in time_value and ',' not in time_value:
            return float(time_value)  # Return fixed time

        # Process range time
        min_time, max_time = map(float, time_value.split('-' if '-' in time_value else ','))
        return random.uniform(min_time, max_time)
    except:
        return random.uniform(0.1, 0.8)  # Return default value when error

class CursorRegistration:
    def __init__(self, translator=None, use_incognito=True, app_dir=None):
        self.translator = translator
        # Set to display mode
        os.environ['BROWSER_HEADLESS'] = 'False'
        self.browser = None
        self.controller = None
        self.sign_up_url = "https://authenticator.cursor.sh/sign-up"
        self.settings_url = "https://www.cursor.com/settings"
        self.email_address = None
        self.signup_tab = None
        self.email_tab = None
        self.use_incognito = use_incognito  # 无痕模式设置
        self.app_dir = app_dir  # 应用目录路径
        self.keep_browser_open = False  # 标记是否保持浏览器打开

        # 获取配置
        self.config = get_config(translator)

        # 调试日志
        print(f"🔍 [DEBUG] CursorRegistration 初始化:")
        print(f"  - 无痕模式设置: {self.use_incognito}")
        print(f"  - 应用目录: {self.app_dir}")

        # initialize Faker instance
        self.faker = Faker()

        # Token information
        self.extracted_token = None
        self.workos_cursor_session_token = None

        # generate account information
        self.password = self._generate_password()
        # 不在构造函数中生成姓名，等待外部设置
        self.first_name = None
        self.last_name = None

        print(f"\n{Fore.CYAN}{EMOJI['PASSWORD']} {self.translator.get('register.password') if self.translator else '密码'}: {self.password} {Style.RESET_ALL}")

    def _generate_password(self, length=12):
        """Generate password"""
        return self.faker.password(length=length, special_chars=True, digits=True, upper_case=True, lower_case=True)

    def setup_email(self):
        """Setup Email"""
        try:
            # Try to get a suggested email
            account_manager = AccountManager(self.translator)
            suggested_email = account_manager.suggest_email(self.first_name, self.last_name)
            
            if suggested_email:
                if self.translator:
                    print(f"{Fore.CYAN}{EMOJI['START']} {self.translator.get('register.suggest_email', suggested_email=suggested_email)}")
                else:
                    print(f"{Fore.CYAN}{EMOJI['START']} Suggested email: {suggested_email}")
                if self.translator:
                    print(f"{Fore.CYAN}{EMOJI['START']} {self.translator.get('register.use_suggested_email_or_enter')}")
                else:
                    print(f"{Fore.CYAN}{EMOJI['START']} Type 'yes' to use this email or enter your own email:")
                user_input = input().strip()
                
                if user_input.lower() == 'yes' or user_input.lower() == 'y':
                    self.email_address = suggested_email
                else:
                    # User input is their own email address
                    self.email_address = user_input
            else:
                # If there's no suggested email
                print(f"{Fore.CYAN}{EMOJI['START']} {self.translator.get('register.manual_email_input') if self.translator else 'Please enter your email address:'}")
                self.email_address = input().strip()
            
            # Validate if the email is valid
            if '@' not in self.email_address:
                print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.invalid_email') if self.translator else 'Invalid email address'}{Style.RESET_ALL}")
                return False
                
            print(f"{Fore.CYAN}{EMOJI['MAIL']} {self.translator.get('register.email_address')}: {self.email_address}" + "\n" + f"{Style.RESET_ALL}")
            return True
            
        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.email_setup_failed', error=str(e))}{Style.RESET_ALL}")
            return False

    def get_verification_code(self):
        """Get Verification Code from frontend via temp file"""
        import tempfile
        import os

        try:
            # 输出JSON格式的请求，让前端知道需要验证码
            print(json.dumps({
                "action": "request_verification_code",
                "message": "请输入6位验证码",
                "status": "waiting_for_code"
            }, ensure_ascii=False))
            print(f"{Fore.CYAN}{EMOJI['CODE']} 等待前端输入验证码...{Style.RESET_ALL}")

            # 等待前端通过临时文件传递验证码
            # 使用绝对路径确保与Tauri一致
            temp_dir = tempfile.gettempdir()
            code_file = os.path.join(temp_dir, "cursor_verification_code.txt")
            cancel_file = os.path.join(temp_dir, "cursor_registration_cancel.txt")

            print(f"{Fore.CYAN}{EMOJI['INFO']} 临时目录: {temp_dir}{Style.RESET_ALL}")
            print(f"{Fore.CYAN}{EMOJI['INFO']} 验证码文件: {code_file}{Style.RESET_ALL}")
            print(f"{Fore.CYAN}{EMOJI['INFO']} 取消文件: {cancel_file}{Style.RESET_ALL}")

            # 清理可能存在的旧文件
            for file_path in [code_file, cancel_file]:
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        print(f"{Fore.YELLOW}{EMOJI['INFO']} 清理旧文件: {file_path}{Style.RESET_ALL}")
                    except Exception as e:
                        print(f"{Fore.RED}{EMOJI['ERROR']} 清理文件失败 {file_path}: {e}{Style.RESET_ALL}")

            # 等待文件出现，最多等待60秒（减少等待时间）
            max_wait = 60
            wait_time = 0

            while wait_time < max_wait:
                # 检查是否有取消请求
                if os.path.exists(cancel_file):
                    print(f"{Fore.YELLOW}{EMOJI['INFO']} 收到取消请求，停止等待验证码{Style.RESET_ALL}")
                    try:
                        os.remove(cancel_file)
                    except:
                        pass
                    return None

                if os.path.exists(code_file):
                    try:
                        with open(code_file, 'r') as f:
                            code = f.read().strip()

                        # 删除临时文件
                        try:
                            os.remove(code_file)
                        except:
                            pass

                        # 验证验证码格式
                        if code.isdigit() and len(code) == 6:
                            print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 收到验证码: {code}{Style.RESET_ALL}")
                            return code
                        elif code.lower() == 'cancel':
                            print(f"{Fore.YELLOW}{EMOJI['INFO']} 用户取消验证码输入{Style.RESET_ALL}")
                            return None
                        else:
                            print(f"{Fore.RED}{EMOJI['ERROR']} 无效的验证码格式: {code}{Style.RESET_ALL}")
                            return None

                    except Exception as e:
                        print(f"{Fore.RED}{EMOJI['ERROR']} 读取验证码文件失败: {str(e)}{Style.RESET_ALL}")
                        return None

                # 每10秒显示一次等待状态
                if wait_time % 10 == 0 and wait_time > 0:
                    remaining = max_wait - wait_time
                    print(f"{Fore.YELLOW}{EMOJI['INFO']} 仍在等待验证码... (剩余 {remaining} 秒){Style.RESET_ALL}")

                time.sleep(1)
                wait_time += 1

            print(f"{Fore.RED}{EMOJI['ERROR']} 等待验证码超时 ({max_wait}秒){Style.RESET_ALL}")
            return None

        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.code_input_failed', error=str(e)) if self.translator else f'验证码输入失败: {str(e)}'}{Style.RESET_ALL}")
            return None

    def register_cursor(self):
        """Register Cursor"""
        browser_tab = None
        try:
            print(f"{Fore.CYAN}{EMOJI['START']} {self.translator.get('register.register_start')}...{Style.RESET_ALL}")
            
            # Check if tempmail_plus is enabled
            config = get_config(self.translator)
            email_tab = None
            if config and config.has_section('TempMailPlus'):
                if config.getboolean('TempMailPlus', 'enabled'):
                    email = config.get('TempMailPlus', 'email')
                    epin = config.get('TempMailPlus', 'epin')
                    if email and epin:
                        from email_tabs.tempmail_plus_tab import TempMailPlusTab
                        email_tab = TempMailPlusTab(email, epin, self.translator)
                        print(f"{Fore.CYAN}{EMOJI['MAIL']} {self.translator.get('register.using_tempmail_plus')}{Style.RESET_ALL}")
            
            # Use new_signup.py directly for registration
            from new_signup import main as new_signup_main
            
            # Execute new registration process, passing translator
            result, browser_tab = new_signup_main(
                email=self.email_address,
                password=self.password,
                first_name=self.first_name,
                last_name=self.last_name,
                email_tab=email_tab,  # Pass email_tab if tempmail_plus is enabled
                controller=self,  # Pass self instead of self.controller
                translator=self.translator,
                use_incognito=self.use_incognito  # Pass incognito mode setting
                # app_dir is not passed to new_signup_main, it's only used in this class
            )
            
            if result:
                # Use the returned browser instance to get account information
                self.signup_tab = browser_tab  # Save browser instance
                success = self._get_account_info()

                if success:
                    # 注册成功后，继续执行银行卡绑定流程
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 开始银行卡绑定流程...{Style.RESET_ALL}")
                    card_success = self._setup_payment_method(browser_tab)
                    if card_success == "non_china_completed":
                        print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 银行卡信息填写完成，浏览器保持打开状态{Style.RESET_ALL}")
                        print(f"{Fore.YELLOW}{EMOJI['INFO']} 请手动完成剩余的地址信息填写和表单提交{Style.RESET_ALL}")
                        print(f"{Fore.CYAN}{EMOJI['INFO']} Python进程将保持运行，浏览器不会自动关闭{Style.RESET_ALL}")
                        print(f"{Fore.CYAN}{EMOJI['INFO']} 完成后请手动关闭浏览器或终止程序{Style.RESET_ALL}")
                        # 设置标记，不关闭浏览器，并保持进程运行
                        self.keep_browser_open = True
                        self._wait_for_user_completion(browser_tab)
                        return True
                    elif card_success:
                        print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 银行卡绑定成功{Style.RESET_ALL}")
                        # 银行卡绑定成功后等待25秒
                        print(f"{Fore.CYAN}{EMOJI['INFO']} 银行卡绑定完成，等待25秒后关闭浏览器...{Style.RESET_ALL}")
                        time.sleep(25)
                    else:
                        print(f"{Fore.YELLOW}{EMOJI['WARNING']} 银行卡绑定失败，但注册已完成{Style.RESET_ALL}")
                        # 银行卡绑定失败也等待一段时间
                        print(f"{Fore.CYAN}{EMOJI['INFO']} 等待15秒后关闭浏览器...{Style.RESET_ALL}")
                        time.sleep(15)
                else:
                    # 注册失败，等待5秒后关闭
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 注册失败，等待5秒后关闭浏览器...{Style.RESET_ALL}")
                    time.sleep(5)

                # Close browser after getting information (except for non-China addresses)
                if browser_tab and not self.keep_browser_open:
                    try:
                        browser_tab.quit()
                    except:
                        pass

                return success
            
            return False
            
        except Exception as e:
            safe_print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.register_process_error', error=str(e))}{Style.RESET_ALL}")
            return False
        finally:
            # Ensure browser is closed in any case (except when keep_browser_open is True)
            if browser_tab and not self.keep_browser_open:
                try:
                    browser_tab.quit()
                except:
                    pass
                
    def _get_account_info(self):
        """Get Account Information and Token"""
        try:
            self.signup_tab.get(self.settings_url)
            time.sleep(2)
            
            usage_selector = (
                "css:div.col-span-2 > div > div > div > div > "
                "div:nth-child(1) > div.flex.items-center.justify-between.gap-2 > "
                "span.font-mono.text-sm\\/\\[0\\.875rem\\]"
            )
            usage_ele = self.signup_tab.ele(usage_selector)
            total_usage = "未知"
            if usage_ele:
                total_usage = usage_ele.text.split("/")[-1].strip()

            print(f"Total Usage: {total_usage}\n")
            print(f"{Fore.CYAN}{EMOJI['WAIT']} {self.translator.get('register.get_token')}...{Style.RESET_ALL}")
            max_attempts = 30
            retry_interval = 2
            attempts = 0

            while attempts < max_attempts:
                try:
                    cookies = self.signup_tab.cookies()
                    for cookie in cookies:
                        if cookie.get("name") == "WorkosCursorSessionToken":
                            # 保存原始的WorkosCursorSessionToken
                            original_workos_token = cookie["value"]
                            # 提取处理后的token
                            token = get_token_from_cookie(cookie["value"], self.translator)
                            print(f"{Fore.GREEN}{EMOJI['SUCCESS']} {self.translator.get('register.token_success')}{Style.RESET_ALL}")
                            print(f"{Fore.CYAN}{EMOJI['INFO']} 原始WorkosCursorSessionToken: {original_workos_token[:50]}...{Style.RESET_ALL}")
                            self._save_account_info(token, total_usage, original_workos_token)
                            return True

                    attempts += 1
                    if attempts < max_attempts:
                        print(f"{Fore.YELLOW}{EMOJI['WAIT']} {self.translator.get('register.token_attempt', attempt=attempts, time=retry_interval)}{Style.RESET_ALL}")
                        time.sleep(retry_interval)
                    else:
                        print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.token_max_attempts', max=max_attempts)}{Style.RESET_ALL}")

                except Exception as e:
                    safe_print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.token_failed', error=str(e))}{Style.RESET_ALL}")
                    attempts += 1
                    if attempts < max_attempts:
                        print(f"{Fore.YELLOW}{EMOJI['WAIT']} {self.translator.get('register.token_attempt', attempt=attempts, time=retry_interval)}{Style.RESET_ALL}")
                        time.sleep(retry_interval)

            return False

        except Exception as e:
            safe_print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.account_error', error=str(e))}{Style.RESET_ALL}")
            return False

    def _save_account_info(self, token, total_usage, original_workos_token=None):
        """Save Account Information to File"""
        try:
            # 注释掉自动切换账号的逻辑，只保存账户信息
            # # Update authentication information first
            # print(f"{Fore.CYAN}{EMOJI['KEY']} {self.translator.get('register.update_cursor_auth_info')}...{Style.RESET_ALL}")
            # if self.update_cursor_auth(email=self.email_address, access_token=token, refresh_token=token, auth_type="Auth_0"):
            #     print(f"{Fore.GREEN}{EMOJI['SUCCESS']} {self.translator.get('register.cursor_auth_info_updated')}...{Style.RESET_ALL}")
            # else:
            #     print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.cursor_auth_info_update_failed')}...{Style.RESET_ALL}")

            # # Reset machine ID
            # print(f"{Fore.CYAN}{EMOJI['UPDATE']} {self.translator.get('register.reset_machine_id')}...{Style.RESET_ALL}")
            # resetter = MachineIDResetter(self.translator)  # Create instance with translator
            # if not resetter.reset_machine_ids():  # Call reset_machine_ids method directly
            #     raise Exception("Failed to reset machine ID")

            safe_print(f"{Fore.CYAN}{EMOJI['INFO']} 注册成功，仅保存账户信息，不自动切换账号{Style.RESET_ALL}")

            # Save account information to file using AccountManager
            account_manager = AccountManager(self.translator, self.app_dir)
            if account_manager.save_account_info(self.email_address, self.password, token, total_usage, original_workos_token):
                # 保存token信息供外部访问
                self.extracted_token = token
                self.workos_cursor_session_token = original_workos_token
                
                # 保存完整的账户信息供输出使用
                self.account_info = {
                    "success": True,
                    "email": self.email_address,
                    "first_name": getattr(self, 'first_name', 'unknown'),
                    "last_name": getattr(self, 'last_name', 'unknown'),
                    "message": "注册成功",
                    "status": "completed",
                    "token": token,
                    "workos_cursor_session_token": original_workos_token
                }
                
                # 输出JSON格式的账户信息供前端捕获
                import json
                print(json.dumps(self.account_info))
                
                return True
            else:
                return False

        except Exception as e:
            safe_print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.save_account_info_failed', error=str(e))}{Style.RESET_ALL}")
            return False

    def _setup_payment_method(self, browser_tab):
        """设置银行卡支付方式"""
        try:
            print(f"{Fore.CYAN}{EMOJI['INFO']} 跳转到 dashboard 页面...{Style.RESET_ALL}")

            # 跳转到 dashboard 页面
            browser_tab.get("https://cursor.com/cn/dashboard")
            time.sleep(get_random_wait_time(self.config, 'page_load_wait'))

            # 查找并点击 "Start 14-day trial" 按钮
            print(f"{Fore.CYAN}{EMOJI['INFO']} 查找 Start 14-day trial 按钮...{Style.RESET_ALL}")

            # 等待页面加载
            time.sleep(get_random_wait_time(self.config, 'page_load_wait'))

            # 查找包含 "Start 14-day trial" 文本的 span 元素的父 button
            trial_button = None
            try:
                # 方法1: 直接查找包含文本的按钮
                trial_button = browser_tab.ele("xpath://button[.//span[contains(text(), 'Start 14-day trial')]]", timeout=10)
            except:
                try:
                    # 方法2: 查找所有按钮，然后检查内容
                    buttons = browser_tab.eles("tag:button")
                    for button in buttons:
                        if button.text and "Start 14-day trial" in button.text:
                            trial_button = button
                            break
                except:
                    pass

            if trial_button:
                print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到 Start 14-day trial 按钮，点击...{Style.RESET_ALL}")
                trial_button.click()
                time.sleep(get_random_wait_time(self.config, 'submit_wait'))

                # 等待银行卡信息页面加载
                print(f"{Fore.CYAN}{EMOJI['INFO']} 等待银行卡信息页面加载...{Style.RESET_ALL}")
                # time.sleep(get_random_wait_time(self.config, 'verification_success_wait'))
                time.sleep(30)


                # 添加调试信息
                print(f"{Fore.CYAN}{EMOJI['INFO']} 当前页面URL: {browser_tab.url}{Style.RESET_ALL}")
                print(f"{Fore.CYAN}{EMOJI['INFO']} 页面标题: {browser_tab.title}{Style.RESET_ALL}")

                # 首先查找并点击 "Pay with card" 按钮来展开银行卡表单
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找 Pay with card 按钮...{Style.RESET_ALL}")
                pay_with_card_button = None

                try:
                    # 先查看页面上有哪些按钮
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 分析页面上的所有按钮...{Style.RESET_ALL}")
                    all_buttons = browser_tab.eles("tag:button")
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 找到 {len(all_buttons)} 个按钮{Style.RESET_ALL}")

                    for i, button in enumerate(all_buttons[:10]):  # 只显示前10个按钮
                        try:
                            button_text = button.text or ""
                            aria_label = button.attr("aria-label") or ""
                            data_testid = button.attr("data-testid") or ""
                            class_name = button.attr("class") or ""
                            print(f"{Fore.CYAN}  按钮 {i+1}: text='{button_text}', aria-label='{aria_label}', data-testid='{data_testid}', class='{class_name[:50]}...'{Style.RESET_ALL}")
                        except Exception as btn_err:
                            print(f"{Fore.YELLOW}  按钮 {i+1}: 获取属性失败 - {str(btn_err)}{Style.RESET_ALL}")

                    try:
                        # 查找包含特定属性的按钮
                        pay_with_card_button = all_buttons[1]
                        if pay_with_card_button:
                            pay_with_card_button.click()
                        print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 执行成功{Style.RESET_ALL}")
                        time.sleep(1)
                    except Exception as e:
                        print(f"{Fore.YELLOW}{EMOJI['WARNING']} 方法1失败: {str(e)}{Style.RESET_ALL}")
                
                except Exception as main_err:
                    print(f"{Fore.RED}{EMOJI['ERROR']} 查找按钮过程中发生错误: {str(main_err)}{Style.RESET_ALL}")
                    print(f"{Fore.YELLOW}{EMOJI['WARNING']} 错误类型: {type(main_err).__name__}{Style.RESET_ALL}")
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 忽略错误，直接尝试查找输入框...{Style.RESET_ALL}")
                    # 等待一下让页面稳定
                    time.sleep(2)

                # 现在尝试查找银行卡输入框
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找银行卡号输入框...{Style.RESET_ALL}")
                card_number_input = browser_tab.ele("#cardNumber", timeout=15)
                if card_number_input:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到银行卡号输入框{Style.RESET_ALL}")
                    return self._fill_payment_form(browser_tab)
                else:
                    print(f"{Fore.YELLOW}{EMOJI['WARNING']} 银行卡信息页面未正确加载，未找到 #cardNumber 元素{Style.RESET_ALL}")

                    # 尝试查找其他可能的元素
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 尝试查找其他支付相关元素...{Style.RESET_ALL}")
                    payment_elements = browser_tab.eles("input[type='text']")
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 找到 {len(payment_elements)} 个文本输入框{Style.RESET_ALL}")

                    # 打印页面源码的一部分用于调试
                    page_source = browser_tab.html[:2000]  # 只取前2000个字符
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 页面源码片段: {page_source}...{Style.RESET_ALL}")

                    return False
            else:
                print(f"{Fore.YELLOW}{EMOJI['WARNING']} 未找到 Start 14-day trial 按钮{Style.RESET_ALL}")
                return False

        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 设置支付方式失败: {str(e)}{Style.RESET_ALL}")
            return False

    def _fill_payment_form(self, browser_tab):
        """填写银行卡信息表单"""
        try:
            print(f"{Fore.CYAN}{EMOJI['INFO']} 开始填写银行卡信息...{Style.RESET_ALL}")
            print(f"{Fore.CYAN}{EMOJI['INFO']} 当前页面URL: {browser_tab.url}{Style.RESET_ALL}")

            # 从配置文件读取银行卡信息
            card_info = self._load_bank_card_config()
            if not card_info:
                print(f"{Fore.RED}{EMOJI['ERROR']} 无法加载银行卡配置，使用默认配置{Style.RESET_ALL}")
                # 使用默认配置作为后备
                card_info = {
                    'cardNumber': '545046940484xxxx',
                    'cardExpiry': '08/30',
                    'cardCvc': '603',
                    'billingName': 'xxx xx',
                    'billingCountry': 'China',
                    'billingPostalCode': '494364',
                    'billingAdministrativeArea': '福建省 — Fujian Sheng',
                    'billingLocality': '福州市',
                    'billingDependentLocality': '闽侯县',
                    'billingAddressLine1': '银泰路201号'
                }
            
            print(f"{Fore.CYAN}{EMOJI['INFO']} 使用银行卡配置: {card_info['cardNumber'][:4]}****{card_info['cardNumber'][-4:]}{Style.RESET_ALL}")
            print(f"{Fore.CYAN}{EMOJI['INFO']} 持卡人: {card_info['billingName']}{Style.RESET_ALL}")

            # 填写卡号
            print(f"{Fore.CYAN}{EMOJI['INFO']} 查找卡号输入框 #cardNumber...{Style.RESET_ALL}")
            card_number_input = browser_tab.ele("#cardNumber")
            if card_number_input:
                print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到卡号输入框，开始填写...{Style.RESET_ALL}")
                card_number_input.clear()
                card_number_input.input(card_info['cardNumber'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))
            else:
                print(f"{Fore.RED}{EMOJI['ERROR']} 未找到卡号输入框 #cardNumber{Style.RESET_ALL}")
                raise Exception("未找到卡号输入框")

            # 填写有效期
            print(f"{Fore.CYAN}{EMOJI['INFO']} 查找有效期输入框 #cardExpiry...{Style.RESET_ALL}")
            card_expiry_input = browser_tab.ele("#cardExpiry")
            if card_expiry_input:
                print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到有效期输入框，开始填写...{Style.RESET_ALL}")
                card_expiry_input.clear()
                card_expiry_input.input(card_info['cardExpiry'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))
            else:
                print(f"{Fore.RED}{EMOJI['ERROR']} 未找到有效期输入框 #cardExpiry{Style.RESET_ALL}")
                raise Exception("未找到有效期输入框")

            # 填写CVC
            print(f"{Fore.CYAN}{EMOJI['INFO']} 查找CVC输入框 #cardCvc...{Style.RESET_ALL}")
            card_cvc_input = browser_tab.ele("#cardCvc")
            if card_cvc_input:
                print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到CVC输入框，开始填写...{Style.RESET_ALL}")
                card_cvc_input.clear()
                card_cvc_input.input(card_info['cardCvc'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))
            else:
                print(f"{Fore.RED}{EMOJI['ERROR']} 未找到CVC输入框 #cardCvc{Style.RESET_ALL}")
                raise Exception("未找到CVC输入框")

            # 填写持卡人姓名
            billing_name_input = browser_tab.ele("#billingName")
            if billing_name_input:
                billing_name_input.clear()
                billing_name_input.input(card_info['billingName'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))

                      # 根据国家决定填写哪些字段
            is_china = card_info['billingCountry'].lower() == 'china'
            print(f"{Fore.CYAN}{EMOJI['INFO']} 检测到国家: {card_info['billingCountry']}, 中国模式: {is_china}{Style.RESET_ALL}")
            
            if is_china:
                # 中国需要填写详细信息
                # 填写邮政编码
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找邮政编码输入框 #billingPostalCode...{Style.RESET_ALL}")
                postal_code_input = browser_tab.ele("#billingPostalCode", timeout=10)
                if postal_code_input:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到邮政编码输入框，开始填写...{Style.RESET_ALL}")
                    postal_code_input.clear()
                    postal_code_input.input(card_info['billingPostalCode'])
                    time.sleep(get_random_wait_time(self.config, 'input_wait'))
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 邮政编码填写完成{Style.RESET_ALL}")

                # 选择省份
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找省份选择框 #billingAdministrativeArea...{Style.RESET_ALL}")
                province_select = browser_tab.ele("#billingAdministrativeArea", timeout=10)
                if province_select:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到省份选择框，开始选择...{Style.RESET_ALL}")
                    try:
                        province_select.select(card_info['billingAdministrativeArea'])
                        time.sleep(get_random_wait_time(self.config, 'input_wait'))
                        print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 省份选择完成{Style.RESET_ALL}")
                    except Exception as e:
                        print(f"{Fore.YELLOW}{EMOJI['WARNING']} 省份选择失败: {str(e)}{Style.RESET_ALL}")

                # 填写城市
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找城市输入框 #billingLocality...{Style.RESET_ALL}")
                city_input = browser_tab.ele("#billingLocality", timeout=10)
                if city_input:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到城市输入框，开始填写...{Style.RESET_ALL}")
                    city_input.clear()
                    city_input.input(card_info['billingLocality'])
                    time.sleep(get_random_wait_time(self.config, 'input_wait'))
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 城市填写完成{Style.RESET_ALL}")

                # 填写区县
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找区县输入框 #billingDependentLocality...{Style.RESET_ALL}")
                district_input = browser_tab.ele("#billingDependentLocality", timeout=10)
                if district_input:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到区县输入框，开始填写...{Style.RESET_ALL}")
                    district_input.clear()
                    district_input.input(card_info['billingDependentLocality'])
                    time.sleep(get_random_wait_time(self.config, 'input_wait'))
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 区县填写完成{Style.RESET_ALL}")

                # 填写地址
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找地址输入框 #billingAddressLine1...{Style.RESET_ALL}")
                address_input = browser_tab.ele("#billingAddressLine1", timeout=10)
                if address_input:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到地址输入框，开始填写...{Style.RESET_ALL}")
                    address_input.clear()
                    address_input.input(card_info['billingAddressLine1'])
                    time.sleep(get_random_wait_time(self.config, 'input_wait'))
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 地址填写完成{Style.RESET_ALL}")
            else:
                # 非中国只需要填写地址，填写完成后不自动提交
                print(f"{Fore.CYAN}{EMOJI['INFO']} 非中国地址，只填写地址字段...{Style.RESET_ALL}")
                print(f"{Fore.CYAN}{EMOJI['INFO']} 查找地址输入框 #billingAddressLine1...{Style.RESET_ALL}")
                address_input = browser_tab.ele("#billingAddressLine1", timeout=10)
                if address_input:
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到地址输入框，开始填写...{Style.RESET_ALL}")
                    address_input.clear()
                    address_input.input(card_info['billingAddressLine1'])
                    time.sleep(3)  # 等待3秒
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 触发Enter事件...{Style.RESET_ALL}")
                    address_input.input('\n')  # 触发Enter事件
                    print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 地址填写完成并触发Enter事件{Style.RESET_ALL}")
                    
                    # 非中国地址填写完成后，等待用户手动填写其他信息
                    print(f"{Fore.YELLOW}{EMOJI['INFO']} 非中国地址填写完成，请手动填写其他必要的地址信息{Style.RESET_ALL}")
                    print(f"{Fore.YELLOW}{EMOJI['INFO']} 填写完成后请手动提交表单，浏览器将保持打开状态{Style.RESET_ALL}")
                    
                    # 返回特殊状态，表示非中国地址填写完成，需要保持浏览器打开
                    return "non_china_completed"
                else:
                    print(f"{Fore.RED}{EMOJI['ERROR']} 未找到地址输入框{Style.RESET_ALL}")
                    return False

            print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 银行卡信息填写完成！{Style.RESET_ALL}")
            
            time.sleep(5)

            # 中国地址才自动提交
            return self._submit_payment_form(browser_tab)

        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 填写银行卡信息失败: {str(e)}{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}{EMOJI['WARNING']} 等待10秒后继续...{Style.RESET_ALL}")
            time.sleep(10)
            print(f"{Fore.CYAN}{EMOJI['INFO']} 尽管填写过程中有错误，但可能部分信息已经填写成功{Style.RESET_ALL}")
            return True  # 返回True让流程继续，而不是立即失败

    def _submit_payment_form(self, browser_tab):
        """提交银行卡信息表单"""
        print(f"{Fore.CYAN}{EMOJI['INFO']} 查找最终提交按钮...{Style.RESET_ALL}")
        all_buttons = browser_tab.eles("tag:button")
        print(f"{Fore.CYAN}{EMOJI['INFO']} 找到 {len(all_buttons)} 个按钮{Style.RESET_ALL}")

        for i, button in enumerate(all_buttons[:10]):  # 只显示前10个按钮
            try:
                button_text = button.text or ""
                aria_label = button.attr("aria-label") or ""
                data_testid = button.attr("data-testid") or ""
                class_name = button.attr("class") or ""
                print(f"{Fore.CYAN}  按钮 {i+1}: text='{button_text}', aria-label='{aria_label}', data-testid='{data_testid}', class='{class_name[:50]}...'{Style.RESET_ALL}")
            except Exception as btn_err:
                print(f"{Fore.YELLOW}  按钮 {i+1}: 获取属性失败 - {str(btn_err)}{Style.RESET_ALL}")

        # 查找最终的提交按钮（可能是 "Complete payment" 或类似的按钮）
        try:
            # 尝试查找常见的提交按钮
            submit_button = all_buttons[4]
            if submit_button:
                print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到提交按钮，点击...{Style.RESET_ALL}")
                submit_button.click()
                time.sleep(20)
                return True


        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 提交银行卡信息失败: {str(e)}{Style.RESET_ALL}")
            return False

    def _load_bank_card_config(self):
        """从配置文件加载银行卡信息"""
        try:
            import json
            import os
            
            # 使用传递进来的应用目录，如果没有则回退到当前工作目录
            if self.app_dir:
                config_dir = self.app_dir
                print(f"{Fore.CYAN}{EMOJI['INFO']} 使用应用目录: {config_dir}{Style.RESET_ALL}")
            else:
                config_dir = os.getcwd()
                print(f"{Fore.YELLOW}{EMOJI['WARNING']} 应用目录未提供，使用当前工作目录: {config_dir}{Style.RESET_ALL}")
            
            config_path = os.path.join(config_dir, 'bank_card_config.json')
            
            print(f"{Fore.CYAN}{EMOJI['INFO']} 尝试加载银行卡配置文件: {config_path}{Style.RESET_ALL}")
            
            if not os.path.exists(config_path):
                print(f"{Fore.YELLOW}{EMOJI['WARNING']} 银行卡配置文件不存在: {config_path}{Style.RESET_ALL}")
                return None
            
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            
            # 验证必需的字段
            required_fields = [
                'cardNumber', 'cardExpiry', 'cardCvc', 'billingName', 
                'billingCountry', 'billingPostalCode', 'billingAdministrativeArea',
                'billingLocality', 'billingDependentLocality', 'billingAddressLine1'
            ]
            
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    print(f"{Fore.YELLOW}{EMOJI['WARNING']} 配置文件缺少必需字段: {field}{Style.RESET_ALL}")
                    return None
            
            print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 成功加载银行卡配置{Style.RESET_ALL}")
            return config_data
            
        except json.JSONDecodeError as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 银行卡配置文件JSON格式错误: {str(e)}{Style.RESET_ALL}")
            return None
        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 加载银行卡配置失败: {str(e)}{Style.RESET_ALL}")
            return None

    def _wait_for_user_completion(self, browser_tab):
        """等待用户手动完成地址填写和表单提交"""
        try:
            print(f"\n{Fore.YELLOW}{'='*60}{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}{EMOJI['INFO']} 等待用户手动操作...{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}{EMOJI['INFO']} 请在浏览器中完成以下操作：{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}  1. 填写必要的地址信息（邮编、州/省等）{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}  2. 点击提交按钮完成银行卡绑定{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}  3. 完成后可以关闭浏览器{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}{'='*60}{Style.RESET_ALL}")
            
            # 保持进程运行，直到用户手动关闭
            print(f"{Fore.CYAN}{EMOJI['INFO']} 程序将保持运行状态...{Style.RESET_ALL}")
            print(f"{Fore.CYAN}{EMOJI['INFO']} 如需退出，请按 Ctrl+C 或关闭此窗口{Style.RESET_ALL}")
            
            # 无限循环，保持进程运行
            while True:
                try:
                    # 检查浏览器是否还在运行
                    if browser_tab:
                        # 每10秒检查一次浏览器状态
                        time.sleep(10)
                        try:
                            # 尝试获取当前URL，如果失败说明浏览器可能已关闭
                            current_url = browser_tab.url
                            print(f"{Fore.CYAN}{EMOJI['INFO']} 浏览器仍在运行，当前页面: {current_url[:50]}...{Style.RESET_ALL}")
                        except:
                            print(f"{Fore.YELLOW}{EMOJI['INFO']} 浏览器已关闭，准备结束进程...{Style.RESET_ALL}")
                            # 浏览器关闭时，输出正常的注册完成信息
                            self._output_completion_info()
                            break
                    else:
                        time.sleep(10)
                        print(f"{Fore.CYAN}{EMOJI['INFO']} 程序保持运行中...{Style.RESET_ALL}")
                except KeyboardInterrupt:
                    print(f"\n{Fore.YELLOW}{EMOJI['INFO']} 用户手动终止程序{Style.RESET_ALL}")
                    # 用户手动终止时也输出完成信息
                    self._output_completion_info()
                    break
                except Exception as e:
                    print(f"{Fore.YELLOW}{EMOJI['WARNING']} 检查浏览器状态时出错: {str(e)}{Style.RESET_ALL}")
                    print(f"{Fore.YELLOW}{EMOJI['INFO']} 程序将结束...{Style.RESET_ALL}")
                    # 出错时也输出完成信息
                    self._output_completion_info()
                    break
                    
        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 等待用户操作时出错: {str(e)}{Style.RESET_ALL}")
            # 出错时也输出完成信息
            self._output_completion_info()

    def _output_completion_info(self):
        """输出注册完成信息，格式与正常注册一致，供前端捕获token"""
        try:
            # 获取已保存的账户信息
            if hasattr(self, 'account_info') and self.account_info:
                # 输出和正常注册完成时一样的JSON格式
                print(json.dumps(self.account_info))
            else:
                # 如果没有保存的账户信息，尝试重新获取
                print(f"{Fore.CYAN}{EMOJI['INFO']} 尝试获取账户信息...{Style.RESET_ALL}")
                if hasattr(self, 'signup_tab') and self.signup_tab:
                    try:
                        # 重新获取账户信息
                        self._get_account_info()
                        if hasattr(self, 'account_info') and self.account_info:
                            print(json.dumps(self.account_info))
                        else:
                            # 如果还是没有，输出基本的成功信息
                            basic_info = {
                                "success": True,
                                "email": getattr(self, 'email_address', 'unknown'),
                                "first_name": getattr(self, 'first_name', 'unknown'),
                                "last_name": getattr(self, 'last_name', 'unknown'),
                                "message": "注册成功",
                                "status": "completed"
                            }
                            print(json.dumps(basic_info))
                    except Exception as e:
                        print(f"{Fore.YELLOW}{EMOJI['WARNING']} 重新获取账户信息失败: {str(e)}{Style.RESET_ALL}")
                        # 输出基本的成功信息
                        basic_info = {
                            "success": True,
                            "email": getattr(self, 'email_address', 'unknown'),
                            "first_name": getattr(self, 'first_name', 'unknown'),
                            "last_name": getattr(self, 'last_name', 'unknown'),
                            "message": "注册成功",
                            "status": "completed"
                        }
                        print(json.dumps(basic_info))
                else:
                    # 输出基本的成功信息
                    basic_info = {
                        "success": True,
                        "email": getattr(self, 'email_address', 'unknown'),
                        "first_name": getattr(self, 'first_name', 'unknown'),
                        "last_name": getattr(self, 'last_name', 'unknown'),
                        "message": "注册成功",
                        "status": "completed"
                    }
                    print(json.dumps(basic_info))
                    
        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 输出完成信息时出错: {str(e)}{Style.RESET_ALL}")
            # 即使出错也输出基本信息
            try:
                basic_info = {
                    "success": True,
                    "email": getattr(self, 'email_address', 'unknown'),
                    "first_name": getattr(self, 'first_name', 'unknown'),
                    "last_name": getattr(self, 'last_name', 'unknown'),
                    "message": "注册成功",
                    "status": "completed"
                }
                print(json.dumps(basic_info))
            except:
                pass

    def start(self):
        """Start Registration Process"""
        try:
            if self.setup_email():
                if self.register_cursor():
                    print(f"\n{Fore.GREEN}{EMOJI['DONE']} {self.translator.get('register.cursor_registration_completed')}...{Style.RESET_ALL}")
                    return True
            return False
        finally:
            # Close email tab
            if hasattr(self, 'temp_email'):
                try:
                    self.temp_email.close()
                except:
                    pass

    def update_cursor_auth(self, email=None, access_token=None, refresh_token=None, auth_type="Auth_0"):
        """Convenient function to update Cursor authentication information"""
        auth_manager = CursorAuth(translator=self.translator)
        return auth_manager.update_auth(email, access_token, refresh_token, auth_type)

def main(translator=None, app_dir=None):
    """Main function to be called from main.py"""
    print(f"\n{Fore.CYAN}{'='*50}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{EMOJI['START']} {translator.get('register.title') if translator else 'Cursor Registration'}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'='*50}{Style.RESET_ALL}")

    registration = CursorRegistration(translator, app_dir=app_dir)
    registration.start()

    print(f"\n{Fore.CYAN}{'='*50}{Style.RESET_ALL}")
    input(f"{EMOJI['INFO']} {translator.get('register.press_enter') if translator else 'Press Enter to continue...'}...")

if __name__ == "__main__":
    import sys
    
    # 检查是否有足够的命令行参数
    # 预期参数顺序: email, first_name, last_name, incognito_flag, app_dir
    app_dir = None
    email = None
    first_name = None
    last_name = None
    use_incognito = True
    
    if len(sys.argv) >= 6:
        # 从 Rust 调用，有完整参数
        email = sys.argv[1]
        first_name = sys.argv[2]
        last_name = sys.argv[3]
        incognito_flag = sys.argv[4]
        app_dir = sys.argv[5]
        use_incognito = incognito_flag.lower() == "true"
        
        print(f"{Fore.CYAN}{EMOJI['INFO']} 从 Rust 调用，参数: email={email}, name={first_name} {last_name}, incognito={use_incognito}, app_dir={app_dir}{Style.RESET_ALL}")
        
        # 创建注册实例并执行
        try:
            registration = CursorRegistration(translator=None, use_incognito=use_incognito, app_dir=app_dir)
            registration.email_address = email
            registration.first_name = first_name
            registration.last_name = last_name
            
            # 直接调用注册流程
            success = registration.register_cursor()
            if success:
                print(f"{Fore.GREEN}{EMOJI['DONE']} 注册流程完成{Style.RESET_ALL}")
            else:
                print(f"{Fore.RED}{EMOJI['ERROR']} 注册流程失败{Style.RESET_ALL}")
                
        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} 注册过程中发生错误: {str(e)}{Style.RESET_ALL}")
    
    elif len(sys.argv) > 1:
        # 只有应用目录参数（向后兼容）
        app_dir = sys.argv[1]
        print(f"{Fore.CYAN}{EMOJI['INFO']} 从命令行参数获取应用目录: {app_dir}{Style.RESET_ALL}")
        
        try:
            from main import translator as main_translator
            main(main_translator, app_dir)
        except ImportError:
            # 如果无法导入main模块，使用默认的None
            main(None, app_dir)
    else:
        # 没有参数，交互式模式
        try:
            from main import translator as main_translator
            main(main_translator, None)
        except ImportError:
            # 如果无法导入main模块，使用默认的None
            main(None, None)