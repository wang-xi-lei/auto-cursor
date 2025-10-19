import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => {
  return (
    <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 backdrop-blur-xl bg-white/70 dark:bg-gradient-to-r dark:from-[#1a1f35]/80 dark:via-[#1e2540]/80 dark:to-[#1a1f35]/80 border-b border-gray-200 dark:border-[#2a3a5a]/50 dark:shadow-[0_4px_20px_rgba(59,130,246,0.1)]">
      <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-blue-200/70">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
};