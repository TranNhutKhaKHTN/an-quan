"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API can be blocked (insecure origin, permissions): fall back to a hidden textarea
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-10 shrink-0 rounded-xl"
      aria-label={label}
      onClick={async () => {
        if (await copy(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? <Check className="text-primary" /> : <Copy />}
      {done ? "Đã chép" : "Chép"}
    </Button>
  );
}

export function ShareRoom({ code }: { code: string }) {
  const link = `${window.location.origin}/lobby/${code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" aria-label="Mời bạn bè">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mã phòng</p>
          <p className="font-mono text-3xl font-extrabold tracking-[0.25em] text-[#6b4423]" data-testid="room-code">
            {code}
          </p>
        </div>
        <CopyButton text={code} label="Sao chép mã phòng" />
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label="Đường dẫn mời"
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 truncate rounded-xl border bg-background px-3 text-sm"
        />
        <CopyButton text={link} label="Sao chép đường dẫn mời" />
      </div>
      {canShare && (
        <Button
          type="button"
          className="h-11 w-full rounded-xl"
          onClick={() =>
            navigator
              .share({ title: "Ô Ăn Quan", text: `Vào phòng ${code} chơi Ô Ăn Quan cùng mình nhé!`, url: link })
              .catch(() => {})
          }
        >
          <Share2 /> Chia sẻ lời mời
        </Button>
      )}
    </section>
  );
}
