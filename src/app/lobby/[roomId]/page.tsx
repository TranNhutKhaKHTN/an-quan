import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomLobby } from "@/components/lobby/RoomLobby";
import { roomCode } from "@/lib/validations/schemas";

export async function generateMetadata({ params }: PageProps<"/lobby/[roomId]">): Promise<Metadata> {
  const parsed = roomCode.safeParse((await params).roomId);
  if (!parsed.success) return { title: "Phòng chờ" };
  // Invite links are shared in chats: give the preview a clear call to action.
  // (No database lookup here, so the code is the only thing it can mention.)
  const title = `Vào phòng ${parsed.data} chơi Ô Ăn Quan`;
  const description = "Bạn được mời chơi Ô Ăn Quan. Mở link, nhập tên và vào phòng cùng bạn bè.";
  // Setting openGraph here replaces the root one, including its file-based image, so repeat it.
  const image = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Ô Ăn Quan" };
  return {
    title: `Phòng ${parsed.data}`,
    description,
    openGraph: { title, description, type: "website", siteName: "Ô Ăn Quan", locale: "vi_VN", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
    robots: { index: false, follow: false }, // private rooms must not be indexed
  };
}

export default async function LobbyPage({ params }: PageProps<"/lobby/[roomId]">) {
  const parsed = roomCode.safeParse((await params).roomId);
  if (!parsed.success) notFound();
  return <RoomLobby code={parsed.data} />;
}
