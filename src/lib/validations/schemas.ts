import { z } from "zod";

export const AVATARS = ["🐯", "🐲", "🦜", "🐘", "🦊", "🐼", "🐸", "🦉"] as const;

export const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, "Room code must be 6 letters/digits");

const displayName = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").trim())
  .pipe(z.string().min(1, "Name is required").max(24));

const avatar = z.enum(AVATARS);
const idempotencyKey = z.string().min(8).max(64).regex(/^[\w-]+$/);

export const createRoomBody = z.object({
  playerLimit: z.number().int().min(2).max(4),
  displayName,
  avatar,
  isPublic: z.boolean().default(false),
  turnSeconds: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90)]).default(0),
  idempotencyKey: idempotencyKey.optional(),
});

export const joinBody = z.object({ displayName, avatar });
export const readyBody = z.object({ ready: z.boolean() });
export const reconnectBody = z.object({ sessionToken: z.string().regex(/^[a-f0-9]{64}$/).optional() });

export const moveBody = z.object({
  cell: z.number().int().min(0).max(63),
  direction: z.union([z.literal(1), z.literal(-1)]),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: idempotencyKey.optional(),
});

export const roomParams = z.object({ roomId: roomCode });

export const timeoutBody = z.object({ expectedVersion: z.number().int().min(0).optional() });
