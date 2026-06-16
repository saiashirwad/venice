import { LanguageModel } from "@effect/ai";
import { Effect } from "effect";

import * as BlockRun from "./blockrun.js";
import * as Daydreams from "./daydreams.js";
import * as Elfa from "./elfa.js";
import * as Messari from "./messari.js";
import * as Telnyx from "./telnyx.js";
import { Wallet } from "./x402/wallet.js";

const program = Effect.gen(function*() {
  const response = yield* LanguageModel.generateText({
    prompt: "Tell me a knock knock joke",
  });
  const { account } = yield* Wallet;

  yield* Effect.log("Wallet: ", account.address);
  yield* Effect.log("response: ", response.text);
});

const blockrun = program.pipe(Effect.provide(BlockRun.Layer));
const daydreams = program.pipe(Effect.provide(Daydreams.Layer));
const elfa = program.pipe(Effect.provide(Elfa.Layer));
const messari = program.pipe(Effect.provide(Messari.Layer));
const telnyx = program.pipe(Effect.provide(Telnyx.Layer));


Effect.runPromise(blockrun);
