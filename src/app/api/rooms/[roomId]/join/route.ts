import type { NextRequest } from "next/server";
import { gameService, parseBody, parseCode, requireUser, respond } from "@/lib/api/route";
import { joinBody } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/join">) {
  return respond(async () => {
    const code = parseCode((await ctx.params).roomId);
    const userId = await requireUser(req);
    const body = await parseBody(req, joinBody);
    return (await gameService()).join(userId, code, body);
  });
}
