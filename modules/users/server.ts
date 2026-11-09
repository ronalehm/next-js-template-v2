import "server-only";

// Server-only entry point for the page. index.ts stays client-safe and does not re-export this.
export { getClerkActivity, listUsers } from "./services/users.service";
