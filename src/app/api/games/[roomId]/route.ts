import type { NextRequest } from "next/server";
import { ServiceError } from "@/features/multiplayer/services/errors";
import { gameService, parseCode, requireUser, respond } from "@/lib/api/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/games/[roomId]: authoritative game state (members only). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/games/[roomId]">) {
  return respond(async () => {
    const code = parseCode((await ctx.params).roomId);
    const userId = await requireUser(req);
    const snap = await (await gameService()).snapshot(userId, code);
    if (!snap.you) throw new ServiceError("NOT_A_MEMBER");
    return snap;
  });
}
