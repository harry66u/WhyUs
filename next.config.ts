import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native/wasm packages that must not be bundled into server chunks.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "unpdf"],
  // Files read at runtime that static analysis cannot see.
  outputFileTracingIncludes: {
    "/api/dossiers/[dossierId]/pdf": ["./src/lib/pdf/fonts/**/*"],
    "/*": ["./drizzle/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
