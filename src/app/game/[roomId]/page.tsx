import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnlineGame } from "@/components/game/OnlineGame";
import { roomCode } from "@/lib/validations/schemas";

export const metadata: Metadata = { title: "Ván đấu · Ô Ăn Quan" };

export default async function GamePage({ params }: PageProps<"/game/[roomId]">) {
  const parsed = roomCode.safeParse((await params).roomId);
  if (!parsed.success) notFound();
  return <OnlineGame code={parsed.data} />;
}
