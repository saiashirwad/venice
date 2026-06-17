import { Effect, Schema, SchemaGetter } from "effect";

import * as CustomJsonAdapter from "./x402/adapters/custom-json.js";
import * as X402LanguageModel from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";

const MESSARI_API_URL = "https://api.messari.io/ai/v2";
export const MODEL = "messari";

const MessariChatResponse = Schema.Struct({
  data: Schema.Struct({
    messages: Schema.Array(
      Schema.Struct({
        role: Schema.optional(Schema.String),
        content: Schema.String,
      }),
    ),
  }),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({
      message: Schema.String,
    }),
    {
      decode: SchemaGetter.transform((input) => ({
        message:
          input.data.messages.find((message) => message.role === "assistant")
            ?.content ??
          input.data.messages.at(-1)?.content ??
          "",
      })),
      encode: SchemaGetter.transform((output) => ({
        data: { messages: [{ role: "assistant", content: output.message }] },
      })),
    },
  ),
);

export const layer = X402LanguageModel.make({
  model: MODEL,
  adapter: CustomJsonAdapter.layer({
    id: "MessariClient",
    apiUrl: MESSARI_API_URL,
    endpoint: "/chat/completions",
    model: MODEL,
    buildRequest: ({ message }: { readonly message: string }) =>
      Effect.succeed({
        messages: [{ role: "user", content: message }],
        response_format: "markdown",
        stream: false,
        verbosity: "succinct",
      }),
    responseSchema: MessariChatResponse,
  }),
  payment: Payments.exact("eip155:*"),
});
