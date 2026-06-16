import { LanguageModel } from "@effect/ai";
import { OpenAiClient, OpenAiLanguageModel, Generated } from "@effect/ai-openai";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer, Schema } from "effect";

import { createAuthFetch } from "venice-x402-client";
import { bytesToHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const VENICE_API_URL = "https://api.venice.ai/api/v1";
const MODEL = "llama-3.3-70b";

type ResponseEncoded = Schema.Schema.Encoded<typeof Generated.Response>;

const RESPONSE_DEFAULTS = {
  error: null,
  incomplete_details: null,
  instructions: null,
  tool_choice: "auto",
  tools: [],
  metadata: {},
  temperature: null,
  top_p: null,
  parallel_tool_calls: false,
} satisfies Partial<ResponseEncoded>;

const account = mnemonicToAccount(process.env.SEED_PHRASE!);
const privateKey = bytesToHex(account.getHdKey().privateKey!);

const veniceFetch = createAuthFetch(privateKey) as typeof globalThis.fetch;

const clientTransformer = HttpClient.transformResponse(
  Effect.flatMap((res) => {
    if (!res.request.url.endsWith("/responses")) {
      return Effect.succeed(res);
    }

    return Effect.map(res.json, (raw) => {
      const body = raw as ResponseEncoded;
      const patched: ResponseEncoded = {
        ...RESPONSE_DEFAULTS,
        ...body,
        usage: body.usage && {
          ...body.usage,
          input_tokens_details: body.usage.input_tokens_details ?? {
            cached_tokens: 0,
          },
          output_tokens_details: body.usage.output_tokens_details ?? {
            reasoning_tokens: 0,
          },
        },
      };

      return HttpClientResponse.fromWeb(
        res.request,
        new Response(JSON.stringify(patched), {
          status: res.status,
          headers: { "content-type": "application/json" },
        }),
      );
    });
  }),
);

const VeniceClient = OpenAiClient.layer({
  apiUrl: VENICE_API_URL,
  transformClient: (client) => client.pipe(clientTransformer),
});

const VeniceModel = OpenAiLanguageModel.layer({ model: MODEL }).pipe(
  Layer.provide(VeniceClient),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, veniceFetch)),
);

const program = Effect.gen(function*() {
  const response = yield* LanguageModel.generateText({
    prompt: "Tell me a knock knock joke",
  });

  yield* Effect.log("Wallet: ", account.address)
  yield* Effect.log("model: ", MODEL);
  yield* Effect.log("response: ", response.text);
}).pipe(Effect.provide(VeniceModel));

Effect.runPromise(program)
