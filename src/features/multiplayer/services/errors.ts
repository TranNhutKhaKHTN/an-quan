export type ServiceErrorCode =
  | "UNAUTHENTICATED"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_NOT_JOINABLE"
  | "NOT_A_MEMBER"
  | "NOT_OWNER"
  | "BAD_STATUS"
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_READY"
  | "STALE_VERSION"
  | "NOT_YOUR_TURN"
  | "INVALID_MOVE"
  | "GAME_NOT_FOUND"
  | "TOO_EARLY"
  | "INVALID_TOKEN"
  | "INTERNAL";

const STATUS: Record<ServiceErrorCode, number> = {
  UNAUTHENTICATED: 401,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  ROOM_NOT_JOINABLE: 409,
  NOT_A_MEMBER: 403,
  NOT_OWNER: 403,
  BAD_STATUS: 409,
  NOT_ENOUGH_PLAYERS: 409,
  NOT_READY: 409,
  STALE_VERSION: 409,
  NOT_YOUR_TURN: 409,
  INVALID_MOVE: 422,
  GAME_NOT_FOUND: 404,
  TOO_EARLY: 409,
  INVALID_TOKEN: 403,
  INTERNAL: 500,
};

export class ServiceError extends Error {
  readonly status: number;
  constructor(
    readonly code: ServiceErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ServiceError";
    this.status = STATUS[code];
  }
}

/** Raised by stores; the service decides how to react. */
export class StaleVersionError extends Error {
  constructor() {
    super("STALE_VERSION");
  }
}
