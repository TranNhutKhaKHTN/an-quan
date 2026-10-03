import type { NextRequest } from "next/server";
import { gameService, optionalUser, parseCode, respond } from "@/lib/api/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/rooms/[roomId]: room info. Members also get the game state and move history. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]">) {
  return respond(async () => {
    const { roomId } = await ctx.params;
    return (await gameService()).snapshot(await optionalUser(req), parseCode(roomId));
  });
}
