import { Brand, Config, Context, Data, Effect, Layer, Redacted } from "effect";
import { mnemonicToAccount } from "viem/accounts";
import type { HDAccount } from "viem/accounts";

export class WalletError extends Data.TaggedError("X402/WalletError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type WalletAccount = Brand.Branded<HDAccount, "X402/WalletAccount">;
const WalletAccount = Brand.nominal<WalletAccount>();

export interface WalletService {
  readonly account: WalletAccount;
}

export class Wallet extends Context.Service<Wallet, WalletService>()(
  "X402/Wallet",
) {
  static readonly layer = Layer.effect(
    Wallet,
    Effect.gen(function* () {
      const seedPhrase = yield* Config.redacted("SEED_PHRASE");
      const account = yield* Effect.try({
        try: () => mnemonicToAccount(Redacted.value(seedPhrase)),
        catch: (cause) =>
          new WalletError({
            message: "Unable to derive wallet from SEED_PHRASE",
            cause,
          }),
      });
      return { account: WalletAccount(account) } as const;
    }),
  );
}
