import { Effect, Layer as EffectLayer, Schema } from "effect";

import { CustomJsonAdapter } from "./x402/adapters/custom-json.js";
import { X402LanguageModel } from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";
import { Wallet } from "./x402/wallet.js";

const MESSARI_API_URL = "https://api.messari.io/ai/v2";
export const MODEL = "messari";

const MessariChatResponse = Schema.transform(
  Schema.Struct({
    data: Schema.Struct({
      messages: Schema.Array(
        Schema.Struct({
          role: Schema.optional(Schema.String),
          content: Schema.String,
        }),
      ),
    }),
  }),
  Schema.Struct({
    message: Schema.String,
  }),
  {
    strict: true,
    decode: (input) => ({
      message:
        input.data.messages.find((message) => message.role === "assistant")
          ?.content ??
        input.data.messages.at(-1)?.content ??
        "",
    }),
    encode: (output) => ({
      data: { messages: [{ role: "assistant", content: output.message }] },
    }),
  },
);

export const Model = X402LanguageModel.make({
  model: MODEL,
  adapter: CustomJsonAdapter.layer({
    id: "MessariClient",
    apiUrl: MESSARI_API_URL,
    endpoint: "/chat/completions",
    model: MODEL,
    buildRequest: ({ message }) =>
      Effect.succeed({
        messages: [{ role: "user", content: message }],
        response_format: "markdown",
        stream: false,
        verbosity: "succinct",
      }),
    responseSchema: MessariChatResponse,
  }),
  payment: Payments.layer("eip155:*"),
});

export const Layer = EffectLayer.provideMerge(Model, Wallet.Default);
