import type { NextRequest } from "next/server";
import { gameService, parseCode, requireUser, respond } from "@/lib/api/route";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/games/[roomId]/surrender">) {
  return respond(async () => {
    const code = parseCode((await ctx.params).roomId);
    const userId = await requireUser(req);
    return (await gameService()).surrender(userId, code);
  });
}
