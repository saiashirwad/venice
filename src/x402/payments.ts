import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import type { SchemeNetworkClient } from "@x402/core/types";
import { FetchHttpClient } from "effect/unstable/http";
import { Data, Effect, Layer, Schema } from "effect";

import { Wallet } from "./wallet.js";
import type { WalletAccount } from "./wallet.js";

export class X402PaymentError extends Data.TaggedError("X402/PaymentError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const NetworkId = Schema.TemplateLiteral([
  Schema.String,
  ":",
  Schema.String,
]);
export type NetworkId = typeof NetworkId.Type;

export const layer = (options: {
  readonly network: NetworkId;
  readonly scheme: (account: WalletAccount) => SchemeNetworkClient;
}): Layer.Layer<never, X402PaymentError, Wallet> =>
  Layer.effect(
    FetchHttpClient.Fetch,
    Effect.gen(function* () {
      const { account } = yield* Wallet;
      const id = yield* Schema.decodeUnknownEffect(NetworkId)(options.network).pipe(
        Effect.mapError(
          (cause) =>
            new X402PaymentError({
              message: `Invalid x402 network identifier: ${options.network}`,
              cause,
            }),
        ),
      );
      // @x402/fetch's wrapped fetch signature differs from global fetch; cast to satisfy Effect's FetchHttpClient.Fetch.
      return wrapFetchWithPaymentFromConfig(globalThis.fetch, {
        schemes: [{ network: id, client: options.scheme(account) }],
      }) as typeof globalThis.fetch;
    }),
  );

export const exact = (network: NetworkId) =>
  layer({ network, scheme: (account) => new ExactEvmScheme(account) });
