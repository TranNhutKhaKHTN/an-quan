import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { GameService } from "@/features/multiplayer/services/gameService";
import { ServiceError } from "@/features/multiplayer/services/errors";
import { SupabaseStore } from "@/features/multiplayer/services/supabaseStore";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { roomCode } from "@/lib/validations/schemas";

/**
 * Test-only: lets the Playwright suite run the real routes, validation and GameService
 * against an in-memory store with no Supabase project. Never enabled on Vercel.
 */
const FAKE_BACKEND = process.env.E2E_FAKE_BACKEND === "1" && !process.env.VERCEL;

let service: GameService | undefined;
/** Stateless: a new instance per cold start is fine, all state lives in Postgres. */
export async function gameService(): Promise<GameService> {
  if (service) return service;
  if (FAKE_BACKEND) {
    const { MemoryStore } = await import("@/tests/helpers/memoryStore");
    const g = globalThis as { __aqFakeService?: GameService };
    return (service = g.__aqFakeService ??= new GameService(new MemoryStore()));
  }
  return (service = new GameService(new SupabaseStore(supabaseAdmin())));
}

/** Verifies the caller's Supabase JWT (anonymous sessions included) and returns their user id. */
export async function requireUser(req: NextRequest): Promise<string> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new ServiceError("UNAUTHENTICATED", "Missing bearer token");
  if (FAKE_BACKEND) {
    try {
      const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
      if (typeof sub === "string" && sub) return sub;
    } catch {
      /* fall through */
    }
    throw new ServiceError("UNAUTHENTICATED", "Invalid fake token");
  }
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new ServiceError("UNAUTHENTICATED", "Invalid or expired session");
  return data.user.id;
}

export async function optionalUser(req: NextRequest): Promise<string | null> {
  return req.headers.has("authorization") ? requireUser(req) : null;
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  return schema.parse(json);
}

export const parseCode = (raw: string) => roomCode.parse(raw);

/** Wraps a route handler with uniform error responses. */
export async function respond(fn: () => Promise<unknown>, status = 200) {
  try {
    const body = await fn();
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        { error: { code: "VALIDATION", message: e.issues.map((i) => i.message).join("; ") } },
        { status: 400 },
      );
    if (e instanceof ServiceError)
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    console.error("[api] unhandled", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500 });
  }
}
