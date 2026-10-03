import type { NextRequest } from "next/server";
import { gameService, parseBody, requireUser, respond } from "@/lib/api/route";
import { createRoomBody } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/rooms: public rooms that are still waiting for players. */
export async function GET() {
  return respond(async () => (await gameService()).listPublicRooms());
}

/** POST /api/rooms: create a room (idempotent per `idempotencyKey`). */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const userId = await requireUser(req);
    const body = await parseBody(req, createRoomBody);
    return (await gameService()).createRoom(userId, body);
  }, 201);
}
