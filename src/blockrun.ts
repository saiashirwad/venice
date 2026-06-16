import { Layer as EffectLayer } from "effect";

import { OpenAiChatAdapter } from "./x402/adapters/openai-chat.js";
import { X402LanguageModel } from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";
import { Wallet } from "./x402/wallet.js";

const BLOCKRUN_API_URL = "https://blockrun.ai/api/v1";
export const MODEL = "openai/gpt-5-nano";
const MAX_TOKENS = 512;

export const Model = X402LanguageModel.make({
  model: MODEL,
  adapter: OpenAiChatAdapter.layer({
    id: "BlockRunClient",
    apiUrl: BLOCKRUN_API_URL,
    model: MODEL,
    maxTokens: MAX_TOKENS,
  }),
  payment: Payments.layer("eip155:*"),
});

export const Layer = EffectLayer.provideMerge(Model, Wallet.Default);
