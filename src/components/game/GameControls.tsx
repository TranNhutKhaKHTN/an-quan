"use client";

import { ArrowRight, BookOpen, Flag, LogOut, RotateCcw, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Direction } from "@/features/game/engine";

interface DirectionProps {
  /** Screen angle (degrees) of the arrow for each direction. */
  angles: Record<Direction, number>;
  disabled: boolean;
  onPick: (d: Direction) => void;
  hint: string;
}

/** Direction picker: arrows point the way pieces will travel on the board. */
export function DirectionPicker({ angles, disabled, onPick, hint }: DirectionProps) {
  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      <p className="on-bg text-sm text-[#4a3320]">{hint}</p>
      <div className="flex gap-3">
        {([-1, 1] as Direction[]).map((d) => (
          <Button
            key={d}
            disabled={disabled}
            onClick={() => onPick(d)}
            className="h-12 w-28 gap-2 rounded-2xl text-base"
            aria-label={d === 1 ? "Rải ngược chiều kim đồng hồ" : "Rải theo chiều kim đồng hồ"}
          >
            <ArrowRight className="size-6" style={{ transform: `rotate(${angles[d]}deg)` }} />
            {d === 1 ? "↺" : "↻"}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface ControlsProps {
  soundOn: boolean;
  canSurrender: boolean;
  onToggleSound: () => void;
  onRules: () => void;
  onRestart?: () => void;
  onSurrender: () => void;
}

export function GameControls({ soundOn, canSurrender, onToggleSound, onRules, onRestart, onSurrender }: ControlsProps) {
  const cls = "h-10 rounded-xl";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="secondary" className={cls} onClick={onToggleSound} aria-pressed={soundOn}>
        {soundOn ? <Volume2 /> : <VolumeX />} Âm thanh
      </Button>
      <Button variant="secondary" className={cls} onClick={onRules}>
        <BookOpen /> Luật chơi
      </Button>
      {onRestart && (
        <Button variant="secondary" className={cls} onClick={onRestart}>
          <RotateCcw /> Ván mới
        </Button>
      )}
      <Button variant="destructive" className={cls} onClick={onSurrender} disabled={!canSurrender}>
        <Flag /> Đầu hàng
      </Button>
      <Link href="/" className="on-bg inline-flex h-10 items-center gap-1.5 text-sm font-medium hover:bg-[#fffaf0]">
        <LogOut className="size-4" /> Thoát
      </Link>
    </div>
  );
}
