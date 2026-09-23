const API_BASE_URL = '';

interface ApiClientOptions {
  token?: string | null;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiClientOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error || data.message || 'An unexpected error occurred',
      response.status,
    );
  }

  return data as T;
}

export const apiClient = {
  get<T>(path: string, options?: ApiClientOptions): Promise<T> {
    return request<T>('GET', path, undefined, options);
  },

  post<T>(path: string, body: unknown, options?: ApiClientOptions): Promise<T> {
    return request<T>('POST', path, body, options);
  },

  patch<T>(path: string, body: unknown, options?: ApiClientOptions): Promise<T> {
    return request<T>('PATCH', path, body, options);
  },
};

export { ApiError };
