# effect-x402-ai

Effect-first [x402](https://x402.org) micropayment inference. Each LLM request pays
its own way: the HTTP client answers an `x402` `402 Payment Required` challenge by
signing a stablecoin (USDC on Base) payment with a local wallet, then retries. No API
keys, no accounts, no subscriptions — just a funded wallet.

The whole thing is wired together as `@effect/ai` `LanguageModel`s, so calling a paid
provider looks exactly like calling any other Effect AI model:

```ts
const response = yield* LanguageModel.generateText({
  prompt: "Tell me a knock knock joke",
});
```

## Architecture

Three composable pieces under `src/x402/`, assembled per provider:

### 1. `Wallet` service (`src/x402/wallet.ts`)

An `Effect.Service` that derives a `viem` `HDAccount` from the `SEED_PHRASE`
environment variable (read as a redacted config). It exposes a single `account` used
to sign payment authorizations.

### 2. Payments scheme layer (`src/x402/payments.ts`)

`Payments.layer({ network, scheme })` produces a `FetchHttpClient.Fetch` layer that
wraps `globalThis.fetch` with `@x402/fetch`'s payment-aware fetch. The `scheme`
function receives the wallet account and returns an x402 `SchemeNetworkClient` that
knows how to build a payment payload for a given challenge:

- `Payments.exact(network)` uses `@x402/evm`'s `ExactEvmScheme` (standard EIP-3009
  transfer authorization) — used by most providers.
- Providers can supply a custom scheme. Daydreams (`src/daydreams.ts`) builds an
  EIP-2612 `Permit` payload by hand: it reads the token `nonces`, computes a deadline,
  and signs the typed data with the wallet account.

Failures surface as the unified `X402PaymentError` tagged error.

### 3. X402 `LanguageModel` adapter (`src/x402/language-model.ts`)

`X402LanguageModel.make({ model, adapter, payment })` builds an
`OpenAiLanguageModel.layer` whose underlying `OpenAiClient` has its `createResponse`
swapped for an adapter implementation, with the payment layer providing the `Fetch`
the client uses. This is what bridges arbitrary paid endpoints into `@effect/ai`.

Two adapters live under `src/x402/adapters/`:

- **`openai-chat`** — for providers that speak the OpenAI Chat Completions wire format.
  It maps `@effect/ai`'s Responses input to chat messages and the chat completion back
  to a `Generated.Response` (see `src/openai-chat-completions.ts`). Used by BlockRun,
  Telnyx, Daydreams.
- **`custom-json`** — for providers with a bespoke JSON request/response shape. The
  provider supplies a `buildRequest` function and a `responseSchema`, and the adapter
  decodes the JSON into a `Generated.Response`. Used by Elfa and Messari.

### Providers (`src/blockrun.ts`, `src/telnyx.ts`, `src/elfa.ts`, `src/messari.ts`, `src/daydreams.ts`)

Each provider is a small, explicit module exporting a `layer` that combines a model
id, an adapter (with its API URL / model / token limits / request shape), and a
payment scheme. They are intentionally kept as separate explicit files rather than a
data-driven registry — the wire details differ enough that the explicit form is the
clearer source of truth.

`src/index.ts` picks one provider to run — edit the `provider` constant to choose
which one — and then runs a sample generation.

## The wallet-at-root decision

There is exactly **one** payer identity for the whole process. `Wallet.Default` is
provided **once**, at the application root in `src/index.ts`:

```ts
.pipe(Effect.provide(Wallet.Default))
```

Every provider's payment layer depends on `Wallet` but never provides it. This means:

- A single funded wallet pays across all providers — switching the `provider` does not
  change who pays.
- The `SEED_PHRASE` is read and the account derived exactly once, not per request or
  per provider.
- Providers stay decoupled from identity: they describe *how* to pay (the scheme), the
  root decides *who* pays (the wallet).

## Running

```sh
bun install
cp .env.example .env   # fill in SEED_PHRASE (a throwaway wallet with a little USDC on Base)
bun run src/index.ts
```

To use a different provider, change the `provider` constant in `src/index.ts` to one of
`providers.blockrun`, `providers.telnyx`, `providers.elfa`, `providers.messari`, or
`providers.daydreams` (defaults to `providers.blockrun`).

## Typecheck

```sh
bun run typecheck
```
