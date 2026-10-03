import type { NextRequest } from "next/server";
import { gameService, parseCode, requireUser, respond } from "@/lib/api/route";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/leave">) {
  return respond(async () => {
    const code = parseCode((await ctx.params).roomId);
    const userId = await requireUser(req);
    return { snapshot: await (await gameService()).leave(userId, code) };
  });
}
