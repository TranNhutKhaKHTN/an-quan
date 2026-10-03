import type { BrowserContext, WebSocketRoute } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Browser-side stand-in for Supabase Auth + Realtime so the real Next.js routes and
 * GameService can be exercised end to end without a Supabase project.
 *  - Auth: anonymous sign-up/refresh return unsigned tokens (the app's fake mode only reads `sub`).
 *  - Realtime: speaks the Phoenix v2 JSON protocol that realtime-js uses; it supports joins with
 *    postgres_changes bindings and presence. After every successful write to /api the hub pushes
 *    a postgres_changes event to every subscribed socket, as the database would.
 */
export const FAKE_SUPABASE_URL = "http://fake-supabase.test";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub: string, exp: number) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub, exp, role: "authenticated" })}.sig`;

function sessionFor(sub: string) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  return {
    access_token: jwt(sub, exp),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `r-${sub}`,
    user: {
      id: sub,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

interface Joined {
  joinRef: string;
  presenceKey: string;
  bindings: { id: number; table: string }[];
}
interface Socket {
  ws: WebSocketRoute;
  topics: Map<string, Joined>;
}

export class Hub {
  sockets = new Set<Socket>();
  presence = new Map<string, Map<string, unknown>>();
  private nextId = 1000;

  allocateId() {
    return this.nextId++;
  }

  send(s: Socket, joinRef: string | null, ref: string | null, topic: string, event: string, payload: unknown) {
    s.ws.send(JSON.stringify([joinRef, ref, topic, event, payload]));
  }

  broadcastPresence(topic: string) {
    const state: Record<string, unknown> = {};
    for (const [key, metas] of this.presence.get(topic) ?? []) state[key] = { metas };
    for (const s of this.sockets) if (s.topics.has(topic)) this.send(s, null, null, topic, "presence_state", state);
  }

  /** Push a committed-change event to every subscriber (clients then re-read the API). */
  notify() {
    for (const s of this.sockets)
      for (const [topic, j] of s.topics)
        for (const b of j.bindings)
          this.send(s, null, null, topic, "postgres_changes", {
            ids: [b.id],
            data: {
              schema: "public",
              table: b.table,
              commit_timestamp: new Date().toISOString(),
              type: "INSERT",
              record: {},
              old_record: {},
              columns: [],
              errors: null,
            },
          });
  }

  /** Simulates a network drop: realtime-js notices and reconnects on its own. */
  dropAll() {
    for (const s of [...this.sockets]) void s.ws.close({ code: 1006, reason: "test drop" });
  }

  private remove(s: Socket) {
    this.sockets.delete(s);
    for (const [topic, j] of s.topics) {
      this.presence.get(topic)?.delete(j.presenceKey);
      this.broadcastPresence(topic);
    }
  }

  handleSocket(ws: WebSocketRoute) {
    const sock: Socket = { ws, topics: new Map() };
    this.sockets.add(sock);
    ws.onClose(() => this.remove(sock));
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
      const reply = (response: unknown = {}) =>
        this.send(sock, joinRef, ref, topic, "phx_reply", { status: "ok", response });

      if (topic === "phoenix") return reply();
      switch (event) {
        case "phx_join": {
          const cfg = payload?.config ?? {};
          const bindings = (cfg.postgres_changes ?? []).map((c: { table: string }) => ({
            id: this.allocateId(),
            table: c.table,
          }));
          sock.topics.set(topic, { joinRef, presenceKey: cfg.presence?.key ?? randomUUID(), bindings });
          reply({
            postgres_changes: (cfg.postgres_changes ?? []).map((c: object, i: number) => ({ ...c, id: bindings[i].id })),
          });
          break;
        }
        case "presence": {
          const j = sock.topics.get(topic);
          if (j && payload?.event === "track") {
            const m = this.presence.get(topic) ?? new Map();
            m.set(j.presenceKey, [{ phx_ref: randomUUID(), ...payload.payload }]);
            this.presence.set(topic, m);
            this.broadcastPresence(topic);
          }
          reply();
          break;
        }
        case "phx_leave": {
          const j = sock.topics.get(topic);
          if (j) {
            this.presence.get(topic)?.delete(j.presenceKey);
            sock.topics.delete(topic);
            this.broadcastPresence(topic);
          }
          reply();
          break;
        }
        default:
          reply(); // access_token, broadcast, ...
      }
    });
  }
}

/** Wire a browser context to the fake Supabase and to the hub. Returns the user id once known. */
export async function installFakeSupabase(context: BrowserContext, hub: Hub) {
  await context.route(`${FAKE_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (url.pathname.endsWith("/auth/v1/signup")) {
      return route.fulfill({ json: sessionFor(randomUUID()), headers: CORS });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      const body = req.postDataJSON?.() ?? {};
      const sub = String(body.refresh_token ?? "").replace(/^r-/, "") || randomUUID();
      return route.fulfill({ json: sessionFor(sub), headers: CORS });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      const auth = req.headers()["authorization"]?.replace(/^Bearer /, "") ?? "";
      const sub = JSON.parse(Buffer.from(auth.split(".")[1] ?? "e30", "base64url").toString()).sub ?? randomUUID();
      return route.fulfill({ json: sessionFor(sub).user, headers: CORS });
    }
    return route.fulfill({ status: 404, json: { message: "not mocked" }, headers: CORS });
  });

  await context.routeWebSocket(/fake-supabase\.test\/realtime\/v1\/websocket/, (ws) => hub.handleSocket(ws));

  // every successful write through the API is a committed change: tell subscribers
  await context.route("**/api/**", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response });
    if (route.request().method() !== "GET" && response.ok()) hub.notify();
  });
}
