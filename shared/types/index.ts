export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface Portfolio {
  id: number;
  name: string;
  created_at: number;
}

export interface CreatePortfolioRequest {
  name: string;
}

export interface UpdatePortfolioRequest {
  name: string;
}
