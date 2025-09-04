export interface UpdateResponse {
  data: {
    id: number;
    attributes: {
      version: string;
      url: string | null;
      description: string;
      update_date: string;
      platforms: {
        force: string;
        updateUrl: string;
      };
      createdAt: string;
      updatedAt: string;
      publishedAt: string;
      setup_exe_url: {
        data: null;
      };
    };
  };
  meta: Record<string, any>;
}

export interface UpdateInfo {
  version: string;
  description: string;
  updateDate: string;
  isForceUpdate: boolean;
  updateUrl: string;
  hasUpdate: boolean;
}
