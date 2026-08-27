import { connectorsForWallets, RainbowKitProvider, useConnectModal } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  createConfig,
  createConnector,
  http,
  injected,
  WagmiProvider,
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import type { Address } from "viem";

import { GENLAYER_CHAIN, GENLAYER_RPC_ENDPOINT, NETWORK_NAME } from "./baskt/config";
import { setActiveWallet } from "./baskt/liveAdapter";

function findLegacyProvider(matches: (provider: NonNullable<typeof window.ethereum>) => boolean) {
  if (typeof window === "undefined" || !window.ethereum) return undefined;
  const providers = window.ethereum.providers ?? [window.ethereum];
  return providers.find(matches);
}

const namedInjectedWallet =
  (
    id: string,
    name: string,
    rdns: string,
    matches: (provider: NonNullable<typeof window.ethereum>) => boolean,
  ) =>
  () => {
    const generic = injectedWallet();
    const provider = findLegacyProvider(matches);
    return {
      ...generic,
      id,
      name,
      rdns,
      installed: Boolean(provider),
      hidden: () => !findLegacyProvider(matches),
      createConnector: (walletDetails: Parameters<typeof generic.createConnector>[0]) =>
        createConnector((config) => ({
          ...injected({ target: { id, name, provider: provider! } })(config),
          ...walletDetails,
        })),
    };
  };

const browserWallet = () => {
  const wallet = injectedWallet();
  return {
    ...wallet,
    hidden: () => typeof window === "undefined" || !window.ethereum,
  };
};

export const wagmiConfig = createConfig({
  chains: [GENLAYER_CHAIN],
  connectors: connectorsForWallets(
    [
      {
        groupName: "Browser wallets",
        wallets: [
          namedInjectedWallet("metaMask", "MetaMask", "io.metamask", (provider) =>
            Boolean(provider.isMetaMask && !provider.isRabby),
          ),
          namedInjectedWallet("rabby", "Rabby", "io.rabby", (provider) =>
            Boolean(provider.isRabby),
          ),
          browserWallet,
        ],
      },
    ],
    { projectId: "", appName: "Baskt" },
  ),
  transports: { [GENLAYER_CHAIN.id]: http(GENLAYER_RPC_ENDPOINT) },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>
        <WalletSync />
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

function WalletSync() {
  const account = useAccount();
  const queryClient = useQueryClient();
  const previousAddress = useRef<string | null>(null);

  useEffect(() => {
    setActiveWallet(
      account.isConnected && account.address && account.connector
        ? { account: account.address as Address, connector: account.connector }
        : null,
    );
  }, [account.address, account.connector, account.isConnected]);

  useEffect(() => {
    const previous = previousAddress.current;
    const next = account.address?.toLowerCase() ?? null;
    if (previous && previous !== next) {
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey.some(
            (part) => typeof part === "string" && part.toLowerCase() === previous,
          ),
      });
    }
    previousAddress.current = next;
  }, [account.address, queryClient]);

  useEffect(() => () => setActiveWallet(null), []);
  return null;
}

export interface BasktWallet {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  network: string;
  networkOk: boolean;
  chainId: number | undefined;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToBradbury: () => Promise<void>;
}

export function useWallet(): BasktWallet {
  const account = useAccount();
  const { connectors, connectAsync, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const connector = account.connector ?? connectors[0];
  const networkOk = Boolean(account.isConnected && account.chainId === GENLAYER_CHAIN.id);

  return useMemo(
    () => ({
      address: account.address ?? null,
      connected: Boolean(account.isConnected && account.address),
      connecting,
      network: NETWORK_NAME,
      networkOk,
      chainId: account.chainId,
      connect: async () => {
        if (openConnectModal) {
          openConnectModal();
          return;
        }
        if (!connector) throw new Error("No injected browser wallet was detected.");
        await connectAsync({ connector });
      },
      disconnect: () => disconnect(),
      switchToBradbury: async () => {
        await switchChainAsync({ chainId: GENLAYER_CHAIN.id });
      },
    }),
    [
      account.address,
      account.chainId,
      account.isConnected,
      connectAsync,
      connecting,
      connector,
      disconnect,
      networkOk,
      openConnectModal,
      switchChainAsync,
    ],
  );
}
