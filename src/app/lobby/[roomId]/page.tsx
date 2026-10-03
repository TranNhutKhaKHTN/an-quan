import type { Metadata } from "next";
import { RoomLobby } from "@/components/lobby/RoomLobby";
import { roomCode } from "@/lib/validations/schemas";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Phòng chờ · Ô Ăn Quan" };

export default async function LobbyPage({ params }: PageProps<"/lobby/[roomId]">) {
  const parsed = roomCode.safeParse((await params).roomId);
  if (!parsed.success) notFound();
  return <RoomLobby code={parsed.data} />;
}
