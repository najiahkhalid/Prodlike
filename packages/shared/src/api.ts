/** Shapes of REST responses shared by the API and the web app. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  checks: { database: 'up' | 'down' };
}

/** Every API error uses this shape: what happened, and what the user can do next (NFR-09). */
export interface ApiError {
  code: string;
  message: string;
  action?: string;
}
