import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Optimistic session check only: every page, layout and service under
// /dashboard still checks permissions on the server (lib/auth.ts).
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

// CSP in Report-Only mode (SEC-1 D2, path A): measures, never blocks. No
// `strict` => no nonce => static rendering is preserved.
// WARNING: Clerk's preset script-src/style-src include 'unsafe-inline' (also
// needed by the inline theme script). That is transitional: Report-Only with
// 'unsafe-inline' does NOT validate a strict CSP. Re-measure without it
// (hash/SRI) before any enforcing CSP (D3/D4/D8).
const contentSecurityPolicy = {
  reportOnly: true,
  directives: {
    "object-src": ["none"],
    "base-uri": ["self"],
    "frame-ancestors": ["none"],
  },
};

export default clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request)) {
      await auth.protect();
    }
  },
  { contentSecurityPolicy },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
