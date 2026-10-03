import Link from "next/link";
import { Bot, Play } from "lucide-react";
import { HomeActions } from "@/components/common/HomeActions";

const modes = [
  { n: 2, title: "2 người", desc: "Cổ điển: bàn chữ nhật", emoji: "🐯🐲" },
  { n: 3, title: "3 người", desc: "Bàn tam giác", emoji: "🐯🐲🦜" },
  { n: 4, title: "4 người", desc: "Bàn vuông", emoji: "🐯🐲🦜🐘" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-5 py-12 text-center">
      <div>
        <div className="mb-2 text-6xl" aria-hidden>
          ♜
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-[#6b4423] sm:text-6xl">Ô Ăn Quan</h1>
        <p className="on-bg mt-3 inline-block text-[#5a3d22]">Trò chơi dân gian Việt Nam cho 2, 3 hoặc 4 người</p>
      </div>

      <section className="w-full space-y-3" aria-label="Chơi với máy">
        <h2 className="on-bg inline-block text-lg font-bold text-[#6b4423]">Chơi với máy</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {modes.map((m) => (
            <Link
              key={m.n}
              href={`/play/bot?players=${m.n}&level=medium`}
              className="wood-board group rounded-3xl p-5 text-[#fff6e0] transition-transform hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-primary/50 focus-visible:outline-none"
            >
              <div className="text-3xl">🐯{"🤖".repeat(m.n - 1)}</div>
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xl font-bold">
                <Bot className="size-4" /> Bạn + {m.n - 1} máy
              </div>
              <div className="text-sm opacity-90">{m.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="w-full space-y-3" aria-label="Chơi chung một máy">
        <h2 className="on-bg inline-block text-lg font-bold text-[#6b4423]">Chơi chung một máy</h2>
        <div className="grid gap-3 sm:grid-cols-3">
        {modes.map((m) => (
          <Link
            key={m.n}
            href={`/play/local?players=${m.n}`}
            className="wood-board group rounded-3xl p-5 text-[#fff6e0] transition-transform hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-primary/50 focus-visible:outline-none"
          >
            <div className="text-3xl">{m.emoji}</div>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xl font-bold">
              <Play className="size-4" /> {m.title}
            </div>
            <div className="text-sm opacity-90">{m.desc}</div>
          </Link>
        ))}
        </div>
      </section>

      <HomeActions />
    </main>
  );
}
