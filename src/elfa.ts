import { Config, Effect, Layer as EffectLayer, Schema } from "effect";

import { CustomJsonAdapter } from "./x402/adapters/custom-json.js";
import { X402LanguageModel } from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";
import { Wallet } from "./x402/wallet.js";

const ELFA_API_URL = "https://api.elfa.ai/x402/v2";
export const MODEL = "elfa-chat";

const ElfaChatResponse = Schema.transform(
  Schema.Struct({
    data: Schema.Struct({
      message: Schema.String,
    }),
  }),
  Schema.Struct({
    message: Schema.String,
  }),
  {
    strict: true,
    decode: (input) => ({ message: input.data.message }),
    encode: (output) => ({ data: { message: output.message } }),
  },
);

const getSpeed = Config.string("ELFA_SPEED").pipe(
  Effect.orElseSucceed(() => "expert"),
);

export const Model = X402LanguageModel.make({
  model: MODEL,
  adapter: CustomJsonAdapter.layer({
    id: "ElfaClient",
    apiUrl: ELFA_API_URL,
    endpoint: "/chat",
    model: MODEL,
    buildRequest: ({ message }) =>
      Effect.map(getSpeed, (speed) => ({
        message,
        analysisType: "chat",
        speed,
      })),
    responseSchema: ElfaChatResponse,
  }),
  payment: Payments.layer("eip155:*"),
});

export const Layer = EffectLayer.provideMerge(Model, Wallet.Default);
