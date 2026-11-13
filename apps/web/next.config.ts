import type { NextConfig } from "next";

const configuracao: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@bastion/contratos"],
};

export default configuracao;
