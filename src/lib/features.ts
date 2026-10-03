/**
 * Online rooms (create/join) are built but switched off in the UI for now.
 * Set NEXT_PUBLIC_ENABLE_ONLINE_ROOMS=true (at build time) to show them again.
 * Existing /lobby and /game links keep working either way.
 */
export const ONLINE_ROOMS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ONLINE_ROOMS === "true";
