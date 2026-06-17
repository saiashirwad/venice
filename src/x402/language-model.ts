import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { X402LanguageModelAdapter } from "./adapter.js";

export const make = <EAdapter, EPayment, RAdapter, RPayment>(config: {
  readonly model: string;
  readonly adapter: Layer.Layer<X402LanguageModelAdapter, EAdapter, RAdapter>;
  readonly payment: Layer.Layer<never, EPayment, RPayment>;
}) =>
  OpenAiLanguageModel.layer({ model: config.model }).pipe(
    Layer.provide(
      Layer.effect(
        OpenAiClient.OpenAiClient,
        Effect.gen(function* () {
          const base = yield* OpenAiClient.make({});
          const adapter = yield* X402LanguageModelAdapter;
          return {
            ...base,
            createResponse: adapter.createResponse,
          };
        }),
      ),
    ),
    Layer.provide(config.adapter),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(config.payment),
  );
