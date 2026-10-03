import { AVATARS } from "@/lib/validations/schemas";

export interface StoredProfile {
  name: string;
  avatar: (typeof AVATARS)[number];
}

const PROFILE_KEY = "aq:profile";
const tokenKey = (code: string) => `aq:token:${code.toUpperCase()}`;

/** localStorage can throw (private mode, blocked storage); the app must work without it. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadProfile(): StoredProfile {
  try {
    const p = JSON.parse(read(PROFILE_KEY) ?? "null");
    if (p && typeof p.name === "string" && AVATARS.includes(p.avatar)) return p;
  } catch {
    /* fall through */
  }
  return { name: "", avatar: AVATARS[0] };
}

export const saveProfile = (p: StoredProfile) => write(PROFILE_KEY, JSON.stringify(p));
export const loadToken = (code: string) => read(tokenKey(code));
export const saveToken = (code: string, token: string) => write(tokenKey(code), token);
export const clearToken = (code: string) => write(tokenKey(code), null);
