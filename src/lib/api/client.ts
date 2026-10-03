"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Returns the current access token, creating an anonymous (guest) Supabase session on first use. */
export async function accessToken(forceRefresh = false): Promise<string> {
  const sb = supabaseBrowser();
  if (forceRefresh) {
    const { data } = await sb.auth.refreshSession();
    if (data.session) return data.session.access_token;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error || !anon.session) throw new ApiError("UNAUTHENTICATED", error?.message ?? "Could not start a guest session", 401);
  return anon.session.access_token;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          Authorization: `Bearer ${await accessToken(attempt > 0)}`,
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
      });
    } catch {
      throw new ApiError("NETWORK", "Không kết nối được máy chủ", 0);
    }
    if (res.status === 401 && attempt === 0) continue; // token may have expired: refresh once
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(json?.error?.code ?? "INTERNAL", json?.error?.message ?? "Lỗi không xác định", res.status);
    }
    return json as T;
  }
}

export const newIdempotencyKey = () => crypto.randomUUID();
