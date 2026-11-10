import type { NextConfig } from "next";

// Evaluated on each call so NODE_ENV can be stubbed in tests.
// T2 can push its CSP Report-Only header onto this array.
export function getSecurityHeaders() {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  }
  return headers;
}

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: getSecurityHeaders() }];
  },
};

export default nextConfig;
