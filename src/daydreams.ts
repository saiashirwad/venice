import type {
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { Schema } from "effect";
import { createPublicClient, http, isAddress, parseAbi } from "viem";
import { base } from "viem/chains";

import * as OpenAiChatAdapter from "./x402/adapters/openai-chat.js";
import * as X402LanguageModel from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";
import type { WalletAccount } from "./x402/wallet.js";

const DAYDREAMS_API_URL = "https://ai.xgate.run/v1";
export const MODEL = "openai:gpt-5-nano";
const PERMIT_DEADLINE_SECONDS = 60 * 60;
const MAX_TOKENS = 1024;

const permitAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
]);

const Eip712Metadata = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const parseChainId = (network: string): number => {
  const chainId = Number(network.split(":")[1]);
  if (!Number.isSafeInteger(chainId)) {
    throw new Payments.X402PaymentError({
      message: "Invalid x402 network identifier",
      cause: new Error(`Invalid chain id in ${network}`),
    });
  }
  return chainId;
};

const asHexAddress = (value: string, field: string): `0x${string}` => {
  if (!isAddress(value)) {
    throw new Payments.X402PaymentError({
      message: `Invalid x402 ${field}`,
      cause: new Error(`Invalid ${field}: ${value}`),
    });
  }
  return value;
};

const eip712Metadata = (requirement: PaymentRequirements) => {
  const result = Schema.decodeUnknownExit(Eip712Metadata)(requirement.extra);
  if (result._tag === "Failure") {
    throw new Payments.X402PaymentError({
      message: "Daydreams payment challenge is missing EIP-712 metadata",
      cause: result.cause,
    });
  }
  return result.value;
};

const makePermitScheme = (account: WalletAccount): SchemeNetworkClient => {
  const createPaymentPayload = async (
    x402Version: number,
    requirement: PaymentRequirements,
  ): Promise<PaymentPayloadResult> => {
    const chainId = parseChainId(requirement.network);
    const { name, version } = eip712Metadata(requirement);
    const asset = asHexAddress(requirement.asset, "asset");
    const payTo = asHexAddress(requirement.payTo, "payTo");

    const nonce = await publicClient.readContract({
      address: asset,
      abi: permitAbi,
      functionName: "nonces",
      args: [account.address],
    });

    const validBefore = BigInt(
      Math.floor(Date.now() / 1000) +
        (requirement.maxTimeoutSeconds || PERMIT_DEADLINE_SECONDS),
    );

    const signature = await account.signTypedData({
      domain: { name, version, chainId, verifyingContract: asset },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: account.address,
        spender: payTo,
        value: BigInt(requirement.amount),
        nonce,
        deadline: validBefore,
      },
    });

    return {
      x402Version,
      payload: {
        authorization: {
          from: account.address,
          to: payTo,
          value: requirement.amount,
          validBefore: validBefore.toString(),
          nonce: nonce.toString(),
        },
        signature,
      },
    };
  };

  return { scheme: "upto", createPaymentPayload };
};

export const layer = X402LanguageModel.make({
  model: MODEL,
  adapter: OpenAiChatAdapter.layer({
    id: "DaydreamsClient",
    apiUrl: DAYDREAMS_API_URL,
    model: MODEL,
    maxTokens: MAX_TOKENS,
  }),
  payment: Payments.layer({
    network: "eip155:8453",
    scheme: makePermitScheme,
  }),
});
