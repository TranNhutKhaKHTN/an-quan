/** Public origin used for absolute URLs in share metadata (Open Graph / Twitter). */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const raw = explicit || (vercel ? `https://${vercel}` : `http://localhost:${process.env.PORT ?? 3000}`);
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const SITE_NAME = "Ô Ăn Quan";
export const SITE_DESCRIPTION =
  "Trò chơi dân gian Ô Ăn Quan cho 2, 3 hoặc 4 người. Chơi với máy hoặc cùng bạn bè ngay trên trình duyệt.";
