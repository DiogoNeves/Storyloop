import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export interface HealthResponse {
  status: string;
}

export const healthQueries = createQueryKeys("health", {
  status: () => ({
    queryKey: ["health"],
    queryFn: async (): Promise<HealthResponse> => {
      const { data } = await apiClient.get<HealthResponse>("/health");
      return data;
    },
  }),
});

