/** Thinking time per turn in local and bot games. */
export const TURN_SECONDS = 10;
export const turnDeadline = (now: number = Date.now()) => now + TURN_SECONDS * 1000;
