import type { NextConfig } from "next";

const configuracao: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bastion/contratos"],
};

export default configuracao;
