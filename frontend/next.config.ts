import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 将所有后端 API 请求通过 Next.js 服务端转发，浏览器只需访问 3000 端口
  async rewrites() {
    return [
      {
        source: "/auth/:path*",
        destination: "http://backend:8000/auth/:path*",
      },
      {
        source: "/chat/:path*",
        destination: "http://backend:8000/chat/:path*",
      },
      {
        source: "/feedback/:path*",
        destination: "http://backend:8000/feedback/:path*",
      },
      {
        source: "/admin/:path*",
        destination: "http://backend:8000/admin/:path*",
      },
    ];
  },
};

export default nextConfig;
