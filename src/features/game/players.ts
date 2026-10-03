import { SEAT_AVATARS, seatName } from "./theme";

export interface PlayerInfo {
  name: string;
  avatar: string;
  online?: boolean;
}

export const defaultPlayers = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, seat) => ({ name: seatName(seat), avatar: SEAT_AVATARS[seat] }));
