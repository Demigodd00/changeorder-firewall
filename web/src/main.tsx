import React from "react";
import { createRoot } from "react-dom/client";
import { RainbowKitProvider, connectorsForWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { chains } from "genlayer-js";
import App from "./App";
import "@rainbow-me/rainbowkit/styles.css";
import "./style.css";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || "";
const studioChain = {
  id: chains.studionet.id,
  name: "GenLayer StudioNet",
  nativeCurrency: chains.studionet.nativeCurrency,
  rpcUrls: chains.studionet.rpcUrls,
  blockExplorers: {
    default: { name: "StudioNet Explorer", url: "https://explorer-studio.genlayer.com" },
  },
  testnet: true,
} as const;

const wallets = projectId
  ? [injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet]
  : [injectedWallet];
const config = createConfig({
  chains: [studioChain],
  connectors: connectorsForWallets([{ groupName: "Connect a wallet", wallets }], {
    appName: "ChangeOrder Firewall",
    projectId,
  }),
  multiInjectedProviderDiscovery: true,
  transports: { [studioChain.id]: http(studioChain.rpcUrls.default.http[0]) },
});
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={studioChain} theme={darkTheme({ accentColor: "#d6e987", borderRadius: "medium" })}>
          <App mobileWalletsEnabled={Boolean(projectId)} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
