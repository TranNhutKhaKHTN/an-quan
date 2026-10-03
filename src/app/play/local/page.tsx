import type { Metadata } from "next";
import { LocalGame } from "@/components/game/LocalGame";
import type { PlayerCount } from "@/features/game/engine";

export const metadata: Metadata = { title: "Chơi tại máy · Ô Ăn Quan" };

export default async function LocalPlayPage({ searchParams }: PageProps<"/play/local">) {
  const raw = Number((await searchParams).players);
  const players = (raw === 3 || raw === 4 ? raw : 2) as PlayerCount;
  return <LocalGame players={players} />;
}
