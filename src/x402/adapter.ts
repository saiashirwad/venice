import { OpenAiClient } from "@effect/ai-openai";
import { Context } from "effect";

export interface Service {
  readonly createResponse: OpenAiClient.Service["createResponse"];
}

export class X402LanguageModelAdapter extends Context.Service<
  X402LanguageModelAdapter,
  Service
>()("X402/LanguageModelAdapter") {}
