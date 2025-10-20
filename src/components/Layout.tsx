import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoSvg from "../assets/logo.svg";
import { getCurrentVersion } from "../services/updateService";
import { useTheme } from "../context/ThemeContext";
import { 
  Home, 
  Fingerprint, 
  ShieldCheck, 
  KeyRound, 
  UserPlus, 
  ScrollText,
  Moon,
  Sun
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [version, setVersion] = useState<string>("");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    // 获取当前版本号
    getCurrentVersion().then(setVersion);
  }, []);

  const navItems = [
    { path: "/", label: "首页", Icon: Home },
    { path: "/machine-id", label: "Machine ID 管理", Icon: Fingerprint },
    { path: "/auth-check", label: "授权检查", Icon: ShieldCheck },
    { path: "/token-manage", label: "Token 管理", Icon: KeyRound },
    { path: "/auto-register", label: "自动注册", Icon: UserPlus },
    { path: "/logs", label: "日志查看", Icon: ScrollText },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gradient-to-br dark:from-[#0a0e27] dark:via-[#0f1419] dark:to-[#0a0e27]">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 z-40 flex flex-col w-72 h-full bg-white dark:bg-gradient-to-b dark:from-[#1a1f35] dark:to-[#151a2e] border-r border-gray-200 dark:border-[#2a3a5a]/50 shadow-sm dark:shadow-[0_0_30px_rgba(59,130,246,0.1)]">
        <div className="flex items-center justify-between flex-shrink-0 h-20 px-5 border-b border-gray-200 dark:border-[#2a3a5a]/50 bg-white dark:bg-[#1a1f35]/80 dark:backdrop-blur-xl">
          <Link to="/" className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.5)]">
              <img src={logoSvg} alt="Cursor Tool Logo" className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cursor Tool</h1>
              <p className="text-xs text-gray-500 dark:text-blue-300/60">专业管理工具</p>
            </div>
          </Link>
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-lg text-gray-600 dark:text-blue-300 hover:bg-gray-50 dark:hover:bg-blue-500/20 transition-all dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            title={theme === "light" ? "切换到暗黑模式" : "切换到明亮模式"}
          >
            {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`group flex items-center px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg dark:shadow-[0_0_25px_rgba(59,130,246,0.5)] scale-[1.02]"
                    : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white hover:scale-[1.01] dark:hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                }`}
              >
                <div className={`p-2 rounded-lg mr-3 transition-all ${
                  active 
                    ? "bg-white/20 shadow-inner" 
                    : "bg-gray-100 dark:bg-white/5 group-hover:bg-gray-200 dark:group-hover:bg-white/10"
                }`}>
                  <item.Icon className="w-5 h-5" strokeWidth={2} />
                </div>
                <span className="flex-1">{item.label}</span>
                {active && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                )}
              </Link>
            );
          })}
        </nav>
        
        {/* Sidebar Footer (compact info only) */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 dark:border-[#2a3a5a]/50 bg-white dark:bg-gradient-to-t dark:from-[#151a2e] dark:to-[#1a1f35]/50">
          <div className="w-full text-center text-xs text-gray-700 dark:text-slate-200">
            {version ? `v${version}` : ""}
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 ml-72 h-full">
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 dark:from-[#0f1419] dark:via-[#0a0e27] dark:to-[#0f1419] overscroll-y-contain">
          <div className="px-4 py-5 mx-auto sm:px-6 lg:px-8 max-w-screen-2xl h-full min-h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
};
