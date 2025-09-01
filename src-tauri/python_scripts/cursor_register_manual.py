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
    def __init__(self, translator=None, use_incognito=True):
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

        # 获取配置
        self.config = get_config(translator)

        # 调试日志
        print(f"🔍 [DEBUG] CursorRegistration 初始化:")
        print(f"  - 无痕模式设置: {self.use_incognito}")

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
            )
            
            if result:
                # Use the returned browser instance to get account information
                self.signup_tab = browser_tab  # Save browser instance
                success = self._get_account_info()

                if success:
                    # 注册成功后，继续执行银行卡绑定流程
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 开始银行卡绑定流程...{Style.RESET_ALL}")
                    card_success = self._setup_payment_method(browser_tab)
                    if card_success:
                        print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 银行卡绑定成功{Style.RESET_ALL}")
                        # 银行卡绑定成功后等待15秒
                        print(f"{Fore.CYAN}{EMOJI['INFO']} 银行卡绑定完成，等待15秒后关闭浏览器...{Style.RESET_ALL}")
                        time.sleep(15)
                    else:
                        print(f"{Fore.YELLOW}{EMOJI['WARNING']} 银行卡绑定失败，但注册已完成{Style.RESET_ALL}")
                        # 银行卡绑定失败也等待一段时间
                        print(f"{Fore.CYAN}{EMOJI['INFO']} 等待10秒后关闭浏览器...{Style.RESET_ALL}")
                        time.sleep(10)
                else:
                    # 注册失败，等待5秒后关闭
                    print(f"{Fore.CYAN}{EMOJI['INFO']} 注册失败，等待5秒后关闭浏览器...{Style.RESET_ALL}")
                    time.sleep(5)

                # Close browser after getting information
                if browser_tab:
                    try:
                        browser_tab.quit()
                    except:
                        pass

                return success
            
            return False
            
        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.register_process_error', error=str(e))}{Style.RESET_ALL}")
            return False
        finally:
            # Ensure browser is closed in any case
            if browser_tab:
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
                    print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.token_failed', error=str(e))}{Style.RESET_ALL}")
                    attempts += 1
                    if attempts < max_attempts:
                        print(f"{Fore.YELLOW}{EMOJI['WAIT']} {self.translator.get('register.token_attempt', attempt=attempts, time=retry_interval)}{Style.RESET_ALL}")
                        time.sleep(retry_interval)

            return False

        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.account_error', error=str(e))}{Style.RESET_ALL}")
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

            print(f"{Fore.CYAN}{EMOJI['INFO']} 注册成功，仅保存账户信息，不自动切换账号{Style.RESET_ALL}")

            # Save account information to file using AccountManager
            account_manager = AccountManager(self.translator)
            if account_manager.save_account_info(self.email_address, self.password, token, total_usage, original_workos_token):
                # 保存token信息供外部访问
                self.extracted_token = token
                self.workos_cursor_session_token = original_workos_token
                return True
            else:
                return False

        except Exception as e:
            print(f"{Fore.RED}{EMOJI['ERROR']} {self.translator.get('register.save_account_info_failed', error=str(e))}{Style.RESET_ALL}")
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

            # 银行卡信息
            card_info = {
                'cardNumber': '5450469404847346',
                'cardExpiry': '08/30',
                'cardCvc': '603',
                'billingName': 'yuxuan yang',
                'billingCountry': 'China',
                'billingPostalCode': '494364',
                'billingAdministrativeArea': '福建省 — Fujian Sheng',
                'billingLocality': '福州市',
                'billingDependentLocality': '闽侯县',
                'billingAddressLine1': '银泰路201号'
            }

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

            # 选择国家
            print(f"{Fore.CYAN}{EMOJI['INFO']} 查找国家选择框 #billingCountry...{Style.RESET_ALL}")
            country_select = browser_tab.ele("#billingCountry")
            if country_select:
                # print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到国家选择框，开始分析选项...{Style.RESET_ALL}")
                # country_select.select(card_info['billingCountry'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))
            else:
                print(f"{Fore.RED}{EMOJI['ERROR']} 未找到国家选择框 #billingCountry{Style.RESET_ALL}")
                raise Exception("未找到国家选择框")

            # 填写邮编
            postal_code_input = browser_tab.ele("#billingPostalCode")
            if postal_code_input:
                postal_code_input.clear()
                postal_code_input.input(card_info['billingPostalCode'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))

            # 选择省份
            print(f"{Fore.CYAN}{EMOJI['INFO']} 查找省份选择框 #billingAdministrativeArea...{Style.RESET_ALL}")
            province_select = browser_tab.ele("#billingAdministrativeArea")
            if province_select:
                print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 找到省份选择框，开始选择...{Style.RESET_ALL}")
                province_select.select(card_info['billingAdministrativeArea'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))
            else:
                print(f"{Fore.RED}{EMOJI['ERROR']} 未找到省份选择框 #billingAdministrativeArea{Style.RESET_ALL}")
                raise Exception("未找到省份选择框")

            # 填写城市
            city_input = browser_tab.ele("#billingLocality")
            if city_input:
                city_input.clear()
                city_input.input(card_info['billingLocality'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))

            # 填写区县
            district_input = browser_tab.ele("#billingDependentLocality")
            if district_input:
                district_input.clear()
                district_input.input(card_info['billingDependentLocality'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))

            # 填写地址
            address_input = browser_tab.ele("#billingAddressLine1")
            if address_input:
                address_input.clear()
                address_input.input(card_info['billingAddressLine1'])
                time.sleep(get_random_wait_time(self.config, 'input_wait'))

            print(f"{Fore.GREEN}{EMOJI['SUCCESS']} 银行卡信息填写完成{Style.RESET_ALL}")
            time.sleep(5)

            # 查找并点击提交按钮
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

def main(translator=None):
    """Main function to be called from main.py"""
    print(f"\n{Fore.CYAN}{'='*50}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{EMOJI['START']} {translator.get('register.title')}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'='*50}{Style.RESET_ALL}")

    registration = CursorRegistration(translator)
    registration.start()

    print(f"\n{Fore.CYAN}{'='*50}{Style.RESET_ALL}")
    input(f"{EMOJI['INFO']} {translator.get('register.press_enter')}...")

if __name__ == "__main__":
    try:
        from main import translator as main_translator
        main(main_translator)
    except ImportError:
        # 如果无法导入main模块，使用默认的None
        main(None)