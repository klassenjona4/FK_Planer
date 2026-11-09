import type { NextConfig } from "next";

const sicherheitsHeader = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit", "@node-rs/argon2", "pg"],
  async headers() {
    return [{ source: "/:path*", headers: sicherheitsHeader }];
  },
};

export default nextConfig;
