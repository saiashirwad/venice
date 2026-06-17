import * as OpenAiChatAdapter from "./x402/adapters/openai-chat.js";
import * as X402LanguageModel from "./x402/language-model.js";
import * as Payments from "./x402/payments.js";

const TELNYX_API_URL = "https://x402.telnyx.com/v1";
export const MODEL = "MiniMaxAI/MiniMax-M2.7";
const MAX_TOKENS = 512;

export const layer = X402LanguageModel.make({
  model: MODEL,
  adapter: OpenAiChatAdapter.layer({
    id: "TelnyxClient",
    apiUrl: TELNYX_API_URL,
    model: MODEL,
    maxTokens: MAX_TOKENS,
  }),
  payment: Payments.exact("eip155:*"),
});
