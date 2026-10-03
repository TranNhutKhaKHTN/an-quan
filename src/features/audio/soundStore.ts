import { create } from "zustand";

const KEY = "aq:sfx";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

interface SoundStore {
  /** Sound effects (sowing, captures, selecting). Separate from the background music. */
  on: boolean;
  hydrate: () => void;
  toggle: () => void;
}

export const useSound = create<SoundStore>((set, get) => ({
  on: true,
  hydrate: () => set({ on: read() }),
  toggle: () => {
    const on = !get().on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
    set({ on });
  },
}));
