const DUNE_API_BASE = "https://api.dune.com/api/v1";

export type DunePerformance = "medium" | "large";

export type DuneExecuteResponse = {
  execution_id: string;
  state: string;
};

export type DuneExecutionStatus = {
  execution_id: string;
  query_id?: number;
  state: string;
  is_execution_finished: boolean;
  submitted_at?: string;
  execution_started_at?: string;
  execution_ended_at?: string;
  expires_at?: string;
  execution_cost_credits?: number;
  error?: {
    type?: string;
    message?: string;
    metadata?: {
      line?: number;
      column?: number;
    };
  };
  result_metadata?: {
    column_names?: string[];
    column_types?: string[];
    row_count?: number;
    total_row_count?: number;
    execution_time_millis?: number;
    pending_time_millis?: number;
    total_result_set_bytes?: number;
  };
};

export type DuneExecutionResult = DuneExecutionStatus & {
  next_offset?: number;
  next_uri?: string;
  result?: {
    rows?: Array<Record<string, unknown>>;
    metadata?: {
      column_names?: string[];
      column_types?: string[];
      row_count?: number;
      total_row_count?: number;
      datapoint_count?: number;
      execution_time_millis?: number;
      pending_time_millis?: number;
      total_result_set_bytes?: number;
      result_set_bytes?: number;
    };
    update_type?: string;
  };
};

type DuneRequestInit = {
  method?: "GET" | "POST";
  body?: unknown;
  searchParams?: URLSearchParams;
};

function getApiKey(): string {
  const apiKey = process.env.DUNE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing DUNE_API_KEY environment variable.");
  }
  return apiKey;
}

async function duneRequest<T>(path: string, init: DuneRequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${DUNE_API_BASE}${path}`);

  if (init.searchParams) {
    url.search = init.searchParams.toString();
  }

  const response = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Dune-Api-Key": apiKey,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await response.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      text ||
      `Dune request failed with ${response.status}`;
    throw new Error(message);
  }

  if (!json) {
    throw new Error("Dune returned an empty or non-JSON response.");
  }

  return json as T;
}

export async function executeDuneSql(sql: string, performance: DunePerformance = "medium") {
  return duneRequest<DuneExecuteResponse>("/sql/execute", {
    method: "POST",
    body: { sql, performance },
  });
}

export async function getDuneExecutionStatus(executionId: string) {
  return duneRequest<DuneExecutionStatus>(`/execution/${encodeURIComponent(executionId)}/status`);
}

export async function getDuneExecutionResult(
  executionId: string,
  options: {
    limit?: number;
    offset?: number;
    allowPartialResults?: boolean;
  } = {}
) {
  const searchParams = new URLSearchParams();

  if (typeof options.limit === "number") {
    searchParams.set("limit", String(options.limit));
  }
  if (typeof options.offset === "number") {
    searchParams.set("offset", String(options.offset));
  }
  if (options.allowPartialResults) {
    searchParams.set("allow_partial_results", "true");
  }

  return duneRequest<DuneExecutionResult>(
    `/execution/${encodeURIComponent(executionId)}/results`,
    { searchParams }
  );
}

export async function getDuneExecutionResultCsv(
  executionId: string,
  options: {
    allowPartialResults?: boolean;
  } = {}
) {
  const apiKey = getApiKey();
  const url = new URL(`${DUNE_API_BASE}/execution/${encodeURIComponent(executionId)}/results/csv`);

  if (options.allowPartialResults) {
    url.searchParams.set("allow_partial_results", "true");
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Dune-Api-Key": apiKey,
    },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Dune CSV request failed with ${response.status}`);
  }

  return text;
}
