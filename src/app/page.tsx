import type { ReactNode } from "react";
import { Bot, Play } from "lucide-react";
import { HomeActions } from "@/components/common/HomeActions";
import { SfxLink } from "@/components/common/SfxLink";

const modes = [
  { n: 2, title: "2 người", desc: "Cổ điển: bàn chữ nhật", emoji: "🐯🐲" },
  { n: 3, title: "3 người", desc: "Bàn tam giác", emoji: "🐯🐲🦜" },
  { n: 4, title: "4 người", desc: "Bàn vuông", emoji: "🐯🐲🦜🐘" },
];

interface CardProps {
  href: string;
  emoji: string;
  icon: ReactNode;
  title: string;
  desc: string;
}

/** Compact on phones (three across, no description), roomy from `sm` up. */
function ModeCard({ href, emoji, icon, title, desc }: CardProps) {
  return (
    <SfxLink
      href={href}
      className="wood-board group rounded-2xl p-2.5 text-[#fff6e0] transition-transform hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-primary/50 focus-visible:outline-none sm:rounded-3xl sm:p-5"
    >
      <div className="text-base leading-tight whitespace-nowrap min-[400px]:text-xl sm:text-3xl">{emoji}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap min-[400px]:text-[13px] sm:mt-2 sm:gap-1.5 sm:text-xl">
        {icon} {title}
      </div>
      <div className="hidden text-sm opacity-90 sm:block">{desc}</div>
    </SfxLink>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-3 py-5 text-center sm:justify-start sm:gap-8 sm:px-5 sm:py-12">
      <div>
        <div className="text-4xl leading-none sm:mb-2 sm:text-6xl" aria-hidden>
          ♜
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-[#6b4423] sm:text-6xl">Ô Ăn Quan</h1>
        <p className="on-bg mt-2 inline-block text-xs text-[#5a3d22] min-[380px]:text-sm sm:mt-3 sm:text-base">
          Trò chơi dân gian Việt Nam cho 2, 3 hoặc 4 người
        </p>
      </div>

      <section className="w-full space-y-2 sm:space-y-3" aria-label="Chơi với máy">
        <h2 className="on-bg inline-block text-base font-bold text-[#6b4423] sm:text-lg">Chơi với máy</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {modes.map((m) => (
            <ModeCard
              key={m.n}
              href={`/play/bot?players=${m.n}&level=medium`}
              emoji={`🐯${"🤖".repeat(m.n - 1)}`}
              icon={<Bot className="hidden size-4 sm:block" />}
              title={`Bạn + ${m.n - 1} máy`}
              desc={m.desc}
            />
          ))}
        </div>
      </section>

      <section className="w-full space-y-2 sm:space-y-3" aria-label="Chơi chung một máy">
        <h2 className="on-bg inline-block text-base font-bold text-[#6b4423] sm:text-lg">Chơi chung một máy</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {modes.map((m) => (
            <ModeCard
              key={m.n}
              href={`/play/local?players=${m.n}`}
              emoji={m.emoji}
              icon={<Play className="hidden size-4 sm:block" />}
              title={m.title}
              desc={m.desc}
            />
          ))}
        </div>
      </section>

      <HomeActions />
    </main>
  );
}
