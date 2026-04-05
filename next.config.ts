import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    proxyClientMaxBodySize: "40mb",
    serverActions: { bodySizeLimit: "40mb" },
  },
  async rewrites() {
    return [
      { source: "/uploads/hero/:path*", destination: "/api/uploads/hero/:path*" },
      { source: "/uploads/items/:path*", destination: "/api/uploads/items/:path*" },
      { source: "/uploads/chat/:path*", destination: "/api/uploads/chat/:path*" },
      // Плейсхолдер: статика public/images/ в prod может быть недоступна — раздаём через API
      { source: "/images/placeholder.svg", destination: "/api/placeholder?w=400&h=400" },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      { protocol: "https", hostname: "komissionka92.ru", pathname: "/**" },
      { protocol: "https", hostname: "www.komissionka92.ru", pathname: "/**" },
      { protocol: "http", hostname: "komissionka92.ru", pathname: "/**" },
      { protocol: "http", hostname: "www.komissionka92.ru", pathname: "/**" },
    ],
  },
};

export default nextConfig;
