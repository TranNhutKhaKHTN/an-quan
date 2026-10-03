"use client";

import { BookOpen, Flag, LogOut, RotateCcw, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
