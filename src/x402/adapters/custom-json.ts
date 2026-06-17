import { OpenAiClient } from "@effect/ai-openai";
import { randomUUID } from "node:crypto";
import { Effect, Layer, Schema } from "effect";
import { AiError } from "effect/unstable/ai";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http";

import { makeResponse, type ResponsesInput } from "../../openai-chat-completions.js";
import { X402LanguageModelAdapter } from "../adapter.js";

export const toMessage = (input: ResponsesInput): string =>
  input
    .map((message) => {
      const role = message.role === "developer" ? "system" : message.role;
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.map((part) => part.text ?? "").join("");
      return `${role}: ${content}`;
    })
    .join("\n\n");

export const layer = <I>(config: {
  readonly id: string;
  readonly apiUrl: string;
  readonly endpoint: string;
  readonly model: string;
  readonly buildRequest: (input: {
    readonly message: string;
  }) => Effect.Effect<unknown, never, never>;
  readonly responseSchema: Schema.Codec<{ readonly message: string }, I>;
}) =>
  Layer.effect(
    X402LanguageModelAdapter,
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient;
      const decode = Schema.decodeUnknownEffect(config.responseSchema);

      const createResponse: OpenAiClient.Service["createResponse"] = (options) =>
        Effect.gen(function* () {
          const message = toMessage(
            options.input as unknown as ResponsesInput,
          );
          const body = yield* config.buildRequest({ message });
          const response = yield* httpClient.post(`${config.apiUrl}${config.endpoint}`, {
            body: HttpBody.jsonUnsafe(body),
          });
          const json = yield* response.json;
          const decoded = yield* decode(json);
          const result = makeResponse({
            id: randomUUID(),
            created_at: Math.floor(Date.now() / 1000),
            model: config.model,
            text: decoded.message,
          });
          return [result, response] as const;
        }).pipe(
          Effect.catchTags({
            HttpClientError: (error) => {
              const reason = error.reason;
              switch (reason._tag) {
                case "TransportError":
                case "EncodeError":
                case "InvalidUrlError":
                  return Effect.fail(
                    AiError.make({
                      module: config.id,
                      method: "createResponse",
                      reason: AiError.NetworkError.fromRequestError(reason),
                    }),
                  );
                case "StatusCodeError":
                  return Effect.fail(
                    AiError.make({
                      module: config.id,
                      method: "createResponse",
                      reason: AiError.reasonFromHttpStatus({
                        status: reason.response.status,
                      }),
                    }),
                  );
                case "DecodeError":
                case "EmptyBodyError":
                  return Effect.fail(
                    AiError.make({
                      module: config.id,
                      method: "createResponse",
                      reason: new AiError.InvalidOutputError({
                        description:
                          reason.description ?? "Failed to decode response",
                      }),
                    }),
                  );
              }
            },
            SchemaError: (error) =>
              Effect.fail(
                AiError.make({
                  module: config.id,
                  method: "createResponse",
                  reason: AiError.InvalidOutputError.fromSchemaError(error),
                }),
              ),
          }),
        );

      return {
        createResponse,
      };
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
