import { invoke } from '@tauri-apps/api/core';
import { UpdateResponse, UpdateInfo } from '../types/update';

console.log('import.meta.env:', import.meta.env);
console.log('VITE_UPDATE_API_URL:', import.meta.env.VITE_UPDATE_API_URL);

const UPDATE_API_URL = import.meta.env.VITE_UPDATE_API_URL

/**
 * 检查是否需要更新
 * @param currentVersion 当前版本
 * @param latestVersion 最新版本
 * @returns 是否需要更新
 */
export function needsUpdate(currentVersion: string, latestVersion: string): boolean {
  const currentParts = currentVersion.split('.');
  const latestParts = latestVersion.split('.');

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = parseInt(currentParts[i] || '0');
    const latestPart = parseInt(latestParts[i] || '0');

    if (latestPart > currentPart) {
      return true;
    } else if (latestPart < currentPart) {
      return false;
    }
  }

  return false; // 版本相同，不需要更新
}

/**
 * 获取当前应用版本
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    return await invoke<string>('get_app_version');
  } catch (error) {
    console.error('Failed to get app version:', error);
    return '0.0.0'; // 默认版本
  }
}

/**
 * 从API获取最新版本信息
 */
export async function fetchLatestVersion(): Promise<UpdateResponse> {
  const response = await fetch(UPDATE_API_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

/**
 * 检查更新
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const [currentVersion, updateResponse] = await Promise.all([
      getCurrentVersion(),
      fetchLatestVersion(),
    ]);

    const { attributes } = updateResponse.data;
    const hasUpdate = needsUpdate(currentVersion, attributes.version);
    const isForceUpdate = attributes.platforms.force === '1';

    return {
      version: attributes.version,
      description: attributes.description,
      updateDate: attributes.update_date,
      isForceUpdate,
      updateUrl: attributes.platforms.updateUrl,
      hasUpdate,
    };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    throw error;
  }
}

/**
 * 打开更新链接
 */
export async function openUpdateUrl(url: string): Promise<void> {
  try {
    await invoke<void>('open_update_url', { url });
  } catch (error) {
    console.error('Failed to open update URL:', error);
    // 如果 Tauri 命令失败，回退到使用 window.open
    window.open(url, '_blank');
  }
}
