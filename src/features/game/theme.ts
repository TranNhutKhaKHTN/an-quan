export const SEAT_COLORS = ["#c2410c", "#2f6f4e", "#2563a8", "#7e3fa0"] as const;
export const SEAT_AVATARS = ["🐯", "🐲", "🦜", "🐘"] as const;
export const seatName = (seat: number) => `Người chơi ${seat + 1}`;
