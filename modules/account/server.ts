import "server-only";

// Server-only entry point for pages. index.ts stays client-safe and does not re-export this.
export { getOwnProfile } from "./services/profile.service";
