import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/v1/*/payments/*/receipt": ["./public/fonts/NotoSansBengali.ttf", "./public/brand/icon-192.png"],
    "/api/v1/*/demo-workspace/receipts/*": ["./public/fonts/NotoSansBengali.ttf", "./public/brand/icon-192.png"],
  },
};

export default nextConfig;
