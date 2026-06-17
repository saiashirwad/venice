import { Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";

import * as BlockRun from "./blockrun.js";
import * as Daydreams from "./daydreams.js";
import * as Elfa from "./elfa.js";
import * as Messari from "./messari.js";
import * as Telnyx from "./telnyx.js";
import { Wallet } from "./x402/wallet.js";

const providers = {
  blockrun: BlockRun.layer,
  telnyx: Telnyx.layer,
  elfa: Elfa.layer,
  messari: Messari.layer,
  daydreams: Daydreams.layer,
};

const provider = providers.blockrun;

const program = (Effect.gen(function*() {
  const response = yield* LanguageModel.generateText({
    prompt: "Tell me a knock knock joke",
  });
  const { account } = yield* Wallet;

  yield* Effect.log("Wallet:", account.address);
  yield* Effect.log("response:", response.text);
})).pipe(
  Effect.provide(Layer.provideMerge(provider, Wallet.layer)),
);

Effect.runPromise(program)
