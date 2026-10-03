"use client";

import { useEffect, useRef } from "react";
import { Music, VolumeX } from "lucide-react";
import { useSound } from "@/features/audio/soundStore";
import { useMusic } from "@/features/audio/musicStore";
import { preloadSounds, unlockSounds } from "@/features/game/sound";

const VOLUME = 0.15;

/**
 * Looping background music for the whole app. It lives in the root layout, so it keeps playing
 * across client-side navigation. Browsers block autoplay, so it starts on the first tap or key press.
 */
export function BackgroundMusic() {
  const audio = useRef<HTMLAudioElement>(null);
  const { enabled, playing, hydrate, setEnabled, setPlaying } = useMusic();

  // one-time setup for all audio: saved preferences and the decoded sound effects
  useEffect(() => {
    hydrate();
    useSound.getState().hydrate();
    void preloadSounds();
    // the first tap (any kind) wakes the audio output, so the select sound answers instantly
    const wake = () => unlockSounds();
    window.addEventListener("pointerdown", wake, { once: true, passive: true });
    window.addEventListener("keydown", wake, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [hydrate]);

  // follow the player's choice
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    el.volume = VOLUME;
    if (enabled)
      el.play().catch(() => {}); // blocked until a gesture: the unlock below retries
    else el.pause();
  }, [enabled]);

  // start on the first interaction if autoplay was blocked
  useEffect(() => {
    if (!enabled) return;
    const unlock = (e: Event) => {
      // the music button decides for itself what a tap on it means
      if ((e.target as Element | null)?.closest?.("[data-music-toggle]"))
        return;
      const el = audio.current;
      if (el && el.paused && useMusic.getState().enabled)
        el.play().catch(() => {});
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((n) =>
      window.addEventListener(n, unlock, { passive: true }),
    );
    return () => events.forEach((n) => window.removeEventListener(n, unlock));
  }, [enabled]);

  // be quiet while the tab is in the background
  useEffect(() => {
    const onVisibility = () => {
      const el = audio.current;
      if (!el) return;
      if (document.visibilityState === "hidden") el.pause();
      else if (useMusic.getState().enabled) el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const on = enabled && playing;
  return (
    <>
      <audio
        ref={audio}
        src="/audio.m4a"
        loop
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        data-music-toggle
        aria-pressed={on}
        aria-label={on ? "Tắt nhạc nền" : "Bật nhạc nền"}
        title={on ? "Tắt nhạc nền" : "Bật nhạc nền"}
        onClick={() => {
          const el = audio.current;
          // enabled but still blocked by the browser: this tap is the gesture that unlocks it
          if (enabled && !playing && el) {
            void el.play().catch(() => {});
            return;
          }
          setEnabled(!enabled);
        }}
        className="fixed right-3 bottom-3 z-40 flex size-11 items-center justify-center rounded-full bg-[#fffaf0]/90 text-[#6b4423] shadow-lg ring-1 ring-[#6b4423]/20 backdrop-blur transition hover:bg-[#fffaf0] focus-visible:ring-4 focus-visible:ring-primary/50 focus-visible:outline-none"
      >
        {on ? <Music className="size-5" /> : <VolumeX className="size-5" />}
      </button>
    </>
  );
}
