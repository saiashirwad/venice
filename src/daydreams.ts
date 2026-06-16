import { FetchHttpClient } from "@effect/platform";
import type {
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { Data, Effect, Layer as EffectLayer, Runtime as EffectRuntime } from "effect";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";

import { OpenAiChatAdapter } from "./x402/adapters/openai-chat.js";
import { X402LanguageModel } from "./x402/language-model.js";
import { Wallet } from "./x402/wallet.js";

const DAYDREAMS_API_URL = "https://ai.xgate.run/v1";
export const MODEL = "openai:gpt-5-nano";
const PERMIT_DEADLINE_SECONDS = 60 * 60;
const MAX_TOKENS = 1024;

class DaydreamsPaymentError extends Data.TaggedError(
  "DaydreamsPaymentError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const permitAbi = [
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const parseChainId = (network: string) =>
  Effect.try({
    try: () => {
      const chainId = Number(network.split(":")[1]);
      if (!Number.isSafeInteger(chainId)) {
        throw new Error(`Invalid chain id in ${network}`);
      }
      return chainId;
    },
    catch: (cause) =>
      new DaydreamsPaymentError({
        message: "Invalid x402 network identifier",
        cause,
      }),
  });

const asHexAddress = (value: string, field: string) =>
  Effect.try({
    try: () => {
      if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new Error(`Invalid ${field}: ${value}`);
      }
      return value as `0x${string}`;
    },
    catch: (cause) =>
      new DaydreamsPaymentError({
        message: `Invalid x402 ${field}`,
        cause,
      }),
  });

const eip712Metadata = (requirement: PaymentRequirements) =>
  Effect.all({
    name: Effect.fromNullable(requirement.extra?.name).pipe(
      Effect.filterOrFail(
        (value): value is string => typeof value === "string",
        () => undefined,
      ),
    ),
    version: Effect.fromNullable(requirement.extra?.version).pipe(
      Effect.filterOrFail(
        (value): value is string => typeof value === "string",
        () => undefined,
      ),
    ),
  }).pipe(
    Effect.mapError(
      () =>
        new DaydreamsPaymentError({
          message: "Daydreams payment challenge is missing EIP-712 metadata",
        }),
    ),
  );

const createPermitScheme = (
  account: ReturnType<typeof mnemonicToAccount>,
): SchemeNetworkClient => {
  const runtime = EffectRuntime.defaultRuntime;

  const readNonce = (asset: `0x${string}`) =>
    Effect.tryPromise({
      try: () =>
        publicClient.readContract({
          address: asset,
          abi: permitAbi,
          functionName: "nonces",
          args: [account.address],
        }),
      catch: (cause) =>
        new DaydreamsPaymentError({
          message: "Unable to read USDC permit nonce",
          cause,
        }),
    });

  const createPaymentPayload = (
    x402Version: number,
    requirement: PaymentRequirements,
  ): Effect.Effect<PaymentPayloadResult, DaydreamsPaymentError> =>
    Effect.gen(function* () {
      const chainId = yield* parseChainId(requirement.network);
      const { name, version } = yield* eip712Metadata(requirement);
      const asset = yield* asHexAddress(requirement.asset, "asset");
      const payTo = yield* asHexAddress(requirement.payTo, "payTo");
      const nonce = yield* readNonce(asset);
      const validBefore = BigInt(
        Math.floor(Date.now() / 1000) +
          (requirement.maxTimeoutSeconds || PERMIT_DEADLINE_SECONDS),
      );

      const signature = yield* Effect.tryPromise({
        try: () =>
          account.signTypedData({
            domain: {
              name,
              version,
              chainId,
              verifyingContract: asset,
            },
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
          }),
        catch: (cause) =>
          new DaydreamsPaymentError({
            message: "Unable to sign x402 permit",
            cause,
          }),
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
    });

  return {
    scheme: "upto",
    createPaymentPayload: (x402Version, requirement) =>
      EffectRuntime.runPromise(runtime)(
        createPaymentPayload(x402Version, requirement),
      ),
  };
};

const DaydreamsPayments = EffectLayer.effect(
  FetchHttpClient.Fetch,
  Effect.gen(function* () {
    const { account } = yield* Wallet;
    const scheme = createPermitScheme(account);
    const client = new x402Client().register("eip155:8453", scheme);
    return wrapFetchWithPayment(globalThis.fetch, client) as typeof globalThis.fetch;
  }),
).pipe(EffectLayer.provide(Wallet.Default));

export const Model = X402LanguageModel.make({
  model: MODEL,
  adapter: OpenAiChatAdapter.layer({
    id: "DaydreamsClient",
    apiUrl: DAYDREAMS_API_URL,
    model: MODEL,
    maxTokens: MAX_TOKENS,
  }),
  payment: DaydreamsPayments,
});

export const Layer = EffectLayer.merge(Model, Wallet.Default);
