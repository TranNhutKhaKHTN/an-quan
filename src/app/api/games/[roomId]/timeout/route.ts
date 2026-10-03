import type { NextRequest } from "next/server";
import { gameService, parseBody, parseCode, requireUser, respond } from "@/lib/api/route";
import { timeoutBody } from "@/lib/validations/schemas";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/games/[roomId]/timeout">) {
  return respond(async () => {
    const code = parseCode((await ctx.params).roomId);
    const userId = await requireUser(req);
    const { expectedVersion } = await parseBody(req, timeoutBody);
    return (await gameService()).timeout(userId, code, expectedVersion);
  });
}
