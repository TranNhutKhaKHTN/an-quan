import type { Metadata } from "next";
import { LocalGame } from "@/components/game/LocalGame";
import type { BotLevel } from "@/features/game/bot";
import type { PlayerCount } from "@/features/game/engine";

export const metadata: Metadata = { title: "Chơi với máy · Ô Ăn Quan" };

export default async function BotPlayPage({ searchParams }: PageProps<"/play/bot">) {
  const q = await searchParams;
  const raw = Number(q.players);
  const players = (raw === 3 || raw === 4 ? raw : 2) as PlayerCount;
  const level = (["easy", "medium", "hard"].includes(String(q.level)) ? q.level : "medium") as BotLevel;
  return <LocalGame players={players} botLevel={level} />;
}
