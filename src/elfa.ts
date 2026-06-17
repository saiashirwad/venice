import { Config, Effect, Schema, SchemaGetter } from "effect";

import * as CustomJsonAdapter from "./x402/adapters/custom-json.js";
import * as X402LanguageModel from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";

const ELFA_API_URL = "https://api.elfa.ai/x402/v2";
export const MODEL = "elfa-chat";

const ElfaChatResponse = Schema.Struct({
  data: Schema.Struct({
    message: Schema.String,
  }),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({
      message: Schema.String,
    }),
    {
      decode: SchemaGetter.transform((input) => ({ message: input.data.message })),
      encode: SchemaGetter.transform((output) => ({
        data: { message: output.message },
      })),
    },
  ),
);

const getSpeed = Config.string("ELFA_SPEED").pipe(
  Effect.orElseSucceed(() => "expert"),
);

export const layer = X402LanguageModel.make({
  model: MODEL,
  adapter: CustomJsonAdapter.layer({
    id: "ElfaClient",
    apiUrl: ELFA_API_URL,
    endpoint: "/chat",
    model: MODEL,
    buildRequest: ({ message }: { readonly message: string }) =>
      Effect.map(getSpeed, (speed) => ({
        message,
        analysisType: "chat",
        speed,
      })),
    responseSchema: ElfaChatResponse,
  }),
  payment: Payments.exact("eip155:*"),
});
