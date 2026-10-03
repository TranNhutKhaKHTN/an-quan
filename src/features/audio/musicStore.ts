import { create } from "zustand";

const KEY = "aq:music";

/** localStorage can throw (private mode, blocked storage); the music must work without it. */
function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
function write(enabled: boolean) {
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
}

interface MusicStore {
  /** The player's choice (default on). */
  enabled: boolean;
  /** Whether the audio element is actually playing (browsers block autoplay until a gesture). */
  playing: boolean;
  /** Read the saved choice; call once after mount so server and client markup match. */
  hydrate: () => void;
  setEnabled: (enabled: boolean) => void;
  setPlaying: (playing: boolean) => void;
}

export const useMusic = create<MusicStore>((set) => ({
  enabled: true,
  playing: false,
  hydrate: () => set({ enabled: read() }),
  setEnabled: (enabled) => {
    write(enabled);
    set({ enabled });
  },
  setPlaying: (playing) => set({ playing }),
}));
