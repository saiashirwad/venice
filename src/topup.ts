import { VeniceClient } from "venice-x402-client";
import { bytesToHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const account = mnemonicToAccount(process.env.SEED_PHRASE!);
const privateKey = bytesToHex(account.getHdKey().privateKey!);

const venice = new VeniceClient(privateKey);
console.log("wallet:", venice.address);

const balance = await venice.getBalance();
console.log("balance:", balance);

if (!balance.canConsume) {
  const amount = Math.max(balance.minimumTopUpUsd ?? 1, 1);
  console.log(`insufficient balance — topping up $${amount} USDC on Base...`);
  await venice.topUp(amount);
  console.log("topped up. new balance:", (await venice.getBalance()).balanceUsd);
} else {
  console.log("balance is spendable — ready to run `bun run start`");
}
