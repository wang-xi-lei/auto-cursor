import React from "react";
import { Link, useLocation } from "react-router-dom";
import logoSvg from "../assets/logo.svg";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "首页", icon: "🏠" },
    { path: "/machine-id", label: "Machine ID 管理", icon: "🔧" },
    { path: "/auth-check", label: "授权检查", icon: "🔐" },
    { path: "/token-manage", label: "Token 管理", icon: "🎫" },
    { path: "/auto-register", label: "自动注册", icon: "📝" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link to="/" className="flex items-center space-x-3">
                  <img
                    src={logoSvg}
                    alt="Cursor Manager Logo"
                    className="w-8 h-8"
                  />
                  <h1 className="text-xl font-bold text-gray-900">
                    Cursor Manager
                  </h1>
                </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      location.pathname === item.path
                        ? "border-blue-500 text-gray-900"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">{children}</div>
      </main>
    </div>
  );
};
