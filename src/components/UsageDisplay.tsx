import React, { useState, useEffect } from "react";
import type { DateRange } from "../types/usage";
import { AggregatedUsageDisplay } from "./AggregatedUsageDisplay";
import { useUsageByToken } from "../context/UsageContext";
import { UsageDetailsModal } from "./UsageDetailsModal";

interface UsageDisplayProps {
  token: string;
  className?: string;
}

export const UsageDisplay: React.FC<UsageDisplayProps> = ({
  token,
  className = "",
}) => {
  // 使用全局状态
  const { usageData, loading, error, fetchUsageData, shouldRefresh } =
    useUsageByToken(token);

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Default to last 30 days
    return { startDate, endDate };
  });
  const [presetPeriod, setPresetPeriod] = useState<string>("30days");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (token) {
      // 首次加载时，只有在需要刷新时才加载数据
      if (shouldRefresh()) {
        console.log("🔄 首次加载或数据过期，从API获取用量数据");
        fetchUsageData(
          dateRange.startDate.getTime(),
          dateRange.endDate.getTime()
        );
      } else {
        console.log("🎯 使用缓存的用量数据");
      }
    }
  }, [token]); // 移除 dateRange 依赖，避免频繁请求

  // 手动刷新函数，用户主动点击时强制刷新
  const handleManualRefresh = async () => {
    console.log("🔄 用户手动刷新用量数据");
    await fetchUsageData(
      dateRange.startDate.getTime(),
      dateRange.endDate.getTime(),
      -1, // teamId
      true // forceRefresh
    );
  };

  // 时间范围变化时的处理函数
  const handleDateRangeChange = async (newDateRange: DateRange) => {
    setDateRange(newDateRange);
    // 时间范围变化时总是获取新数据
    console.log("📅 时间范围变化，获取新的用量数据");
    await fetchUsageData(
      newDateRange.startDate.getTime(),
      newDateRange.endDate.getTime(),
      -1, // teamId
      true // forceRefresh
    );
  };

  const handlePresetPeriodChange = async (period: string) => {
    setPresetPeriod(period);
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "current_month":
        startDate.setDate(1);
        break;
      case "custom":
        // Keep current dates for custom selection
        return;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    await handleDateRangeChange({ startDate, endDate });
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split("T")[0];
  };

  if (!token) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <p className="text-sm text-gray-500">请先登录以查看用量数据</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            📊 用量统计
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 border border-transparent rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "🔄 刷新中..." : "🔄 刷新"}
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-700 bg-green-100 border border-transparent rounded hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              📋 查看明细
            </button>
          </div>
        </div>

        {/* Time Period Selection */}
        <div className="mb-4 space-y-3">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              时间段选择
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => handlePresetPeriodChange("7days")}
                className={`px-3 py-1 text-sm rounded ${
                  presetPeriod === "7days"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                最近7天
              </button>
              <button
                onClick={() => handlePresetPeriodChange("30days")}
                className={`px-3 py-1 text-sm rounded ${
                  presetPeriod === "30days"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                最近30天
              </button>
              <button
                onClick={() => handlePresetPeriodChange("current_month")}
                className={`px-3 py-1 text-sm rounded ${
                  presetPeriod === "current_month"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                本月
              </button>
              <button
                onClick={() => handlePresetPeriodChange("custom")}
                className={`px-3 py-1 text-sm rounded ${
                  presetPeriod === "custom"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                自定义
              </button>
            </div>
          </div>

          {presetPeriod === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  开始日期
                </label>
                <input
                  type="date"
                  value={formatDate(dateRange.startDate)}
                  onChange={(e) => {
                    const newStartDate = new Date(e.target.value);
                    handleDateRangeChange({
                      startDate: newStartDate,
                      endDate: dateRange.endDate,
                    });
                  }}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="开始日期"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  结束日期
                </label>
                <input
                  type="date"
                  value={formatDate(dateRange.endDate)}
                  onChange={(e) => {
                    const newEndDate = new Date(e.target.value);
                    handleDateRangeChange({
                      startDate: dateRange.startDate,
                      endDate: newEndDate,
                    });
                  }}
                  className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="结束日期"
                />
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="inline-flex items-center">
              <svg className="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm text-gray-500">加载用量数据中...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 border border-red-200 rounded-md bg-red-50">
            <p className="text-sm text-red-600">❌ {error}</p>
          </div>
        )}

        {/* Usage Data Display */}
        {usageData && !loading && !error && (
          <AggregatedUsageDisplay
            aggregatedUsage={usageData}
            showTitle={false}
            variant="detailed"
          />
        )}
      </div>

      {/* Usage Details Modal */}
      <UsageDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={token}
      />
    </div>
  );
};
