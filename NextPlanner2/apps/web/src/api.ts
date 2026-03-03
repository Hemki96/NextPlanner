import type {
  ApiErrorDto,
  AuthLoginInput,
  AuthRegisterInput,
  ImportCreateInput,
  ImportJobDto,
  PlanCreateInput,
  PlanDto,
  PlanDuplicateInput,
  PlanRevisionDto,
  PlanUpdateInput,
  TeamDto,
  UserProfileDto
} from "@nextplanner2/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const ACCESS_TOKEN_KEY = "np2_access_token";
const REFRESH_TOKEN_KEY = "np2_refresh_token";

export type SessionDto = {
  user: UserProfileDto;
  teams: TeamDto[];
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type ApiError = ApiErrorDto & { status: number };

let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
let refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) ?? "";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  ifMatch?: string;
  ifNoneMatch?: string;
  allow304?: boolean;
  timeoutMs?: number;
  retry?: number;
};

type RequestResult<T> = {
  status: number;
  headers: Headers;
  data: T;
};

function setTokens(nextAccessToken: string, nextRefreshToken: string) {
  accessToken = nextAccessToken;
  refreshToken = nextRefreshToken;
  localStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
}

function clearTokens() {
  accessToken = "";
  refreshToken = "";
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<RequestResult<T>> {
  const { retry = 1 } = options;

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);

    try {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");

      if (options.auth !== false && accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      if (options.ifMatch) {
        headers.set("If-Match", options.ifMatch);
      }

      if (options.ifNoneMatch) {
        headers.set("If-None-Match", options.ifNoneMatch);
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers,
        signal: controller.signal
      });

      if (response.status === 304 && options.allow304) {
        return {
          status: 304,
          headers: response.headers,
          data: undefined as T
        };
      }

      if (response.status === 401 && options.auth !== false && refreshToken) {
        const refreshed = await refreshSession();
        if (refreshed) {
          continue;
        }
      }

      if (!response.ok) {
        throw await toApiError(response);
      }

      if (response.status === 204) {
        return {
          status: response.status,
          headers: response.headers,
          data: undefined as T
        };
      }

      return {
        status: response.status,
        headers: response.headers,
        data: (await response.json()) as T
      };
    } catch (error) {
      if (attempt === retry || isApiError(error)) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Unreachable");
}

async function toApiError(response: Response): Promise<ApiError> {
  let parsed: Partial<ApiErrorDto> = {};

  try {
    parsed = (await response.json()) as Partial<ApiErrorDto>;
  } catch {
    parsed = {};
  }

  return {
    status: response.status,
    code: (parsed.code as ApiErrorDto["code"]) ?? "INTERNAL_SERVER_ERROR",
    message: parsed.message ?? `HTTP_${response.status}`,
    details: parsed.details,
    traceId: parsed.traceId ?? "n/a"
  };
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      "code" in error &&
      "message" in error &&
      "traceId" in error
  );
}

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) {
    return false;
  }

  try {
    const response = await request<{ accessToken: string; refreshToken: string; expiresInSeconds: number }>(
      "/v1/auth/refresh",
      {
        method: "POST",
        auth: false,
        body: { refreshToken },
        retry: 0
      }
    );

    setTokens(response.data.accessToken, response.data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export function hasSession(): boolean {
  return Boolean(accessToken && refreshToken);
}

export function getAccessToken(): string {
  return accessToken;
}

export async function register(input: AuthRegisterInput): Promise<SessionDto> {
  const response = await request<SessionDto>("/v1/auth/register", {
    method: "POST",
    auth: false,
    body: input,
    retry: 0
  });

  setTokens(response.data.accessToken, response.data.refreshToken);
  return response.data;
}

export async function login(input: AuthLoginInput): Promise<SessionDto> {
  const response = await request<SessionDto>("/v1/auth/login", {
    method: "POST",
    auth: false,
    body: input,
    retry: 0
  });

  setTokens(response.data.accessToken, response.data.refreshToken);
  return response.data;
}

export async function logout(): Promise<void> {
  if (!refreshToken) {
    clearTokens();
    return;
  }

  try {
    await request<void>("/v1/auth/logout", {
      method: "POST",
      auth: false,
      body: { refreshToken },
      retry: 0
    });
  } finally {
    clearTokens();
  }
}

export async function fetchMe(): Promise<{ user: UserProfileDto; teams: TeamDto[] }> {
  const response = await request<{ user: UserProfileDto; teams: TeamDto[] }>("/v1/me", {
    method: "GET"
  });
  return response.data;
}

export async function fetchTeams(): Promise<TeamDto[]> {
  const response = await request<TeamDto[]>("/v1/teams", {
    method: "GET"
  });
  return response.data;
}

export async function fetchPlans(
  teamId: string,
  ifNoneMatch?: string
): Promise<{ plans: PlanDto[]; etag: string | null; notModified: boolean }> {
  const response = await request<PlanDto[]>(`/v1/teams/${teamId}/plans`, {
    method: "GET",
    ifNoneMatch,
    allow304: true,
    retry: 1
  });

  return {
    plans: response.status === 304 ? [] : response.data,
    etag: response.headers.get("etag"),
    notModified: response.status === 304
  };
}

export async function createPlan(teamId: string, input: PlanCreateInput): Promise<{ plan: PlanDto; etag: string | null }> {
  const response = await request<PlanDto>(`/v1/teams/${teamId}/plans`, {
    method: "POST",
    body: input,
    retry: 0
  });

  return {
    plan: response.data,
    etag: response.headers.get("etag")
  };
}

export async function updatePlan(
  teamId: string,
  planId: string,
  input: PlanUpdateInput,
  etag: string
): Promise<{ plan: PlanDto; etag: string | null }> {
  const response = await request<PlanDto>(`/v1/teams/${teamId}/plans/${planId}`, {
    method: "PATCH",
    body: input,
    ifMatch: etag,
    retry: 0
  });

  return {
    plan: response.data,
    etag: response.headers.get("etag")
  };
}

export async function deletePlan(teamId: string, planId: string): Promise<void> {
  await request<void>(`/v1/teams/${teamId}/plans/${planId}`, {
    method: "DELETE",
    retry: 0
  });
}

export async function duplicatePlan(
  teamId: string,
  planId: string,
  input: PlanDuplicateInput
): Promise<{ plan: PlanDto; etag: string | null }> {
  const response = await request<PlanDto>(`/v1/teams/${teamId}/plans/${planId}/duplicate`, {
    method: "POST",
    body: input,
    retry: 0
  });

  return {
    plan: response.data,
    etag: response.headers.get("etag")
  };
}

export async function fetchPlanHistory(teamId: string, planId: string): Promise<PlanRevisionDto[]> {
  const response = await request<PlanRevisionDto[]>(`/v1/teams/${teamId}/plans/${planId}/history`, {
    method: "GET",
    retry: 0
  });

  return response.data;
}

export async function startImport(teamId: string, input: ImportCreateInput): Promise<ImportJobDto> {
  const response = await request<ImportJobDto>(`/v1/teams/${teamId}/imports`, {
    method: "POST",
    body: input,
    retry: 0
  });

  return response.data;
}

export function toPlanEtag(plan: PlanDto): string {
  return `W/"plan-${plan.id}-v${plan.version}"`;
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isVersionConflict(error: unknown): error is ApiError {
  return isApiError(error) && error.code === "VERSION_CONFLICT";
}

export function clearSessionLocally() {
  clearTokens();
}
