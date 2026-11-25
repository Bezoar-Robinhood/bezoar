import { createPublicClient, createWalletClient, defineChain, fallback, http, parseAbi, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

const chain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ABI = parseAbi([
  "function token() view returns (address)",
  "function devWallet() view returns (address)",
  "function runs() view returns (uint256)",
  "function lastRun() view returns (uint256)",
  "function burnReserve() view returns (uint256)",
  "function totalEthToDev() view returns (uint256)",
  "function totalEthSpentOnBurns() view returns (uint256)",
  "function totalTokensBurned() view returns (uint256)",
  "function secondsUntilNextRun() view returns (uint256)",
  "function pending() view returns (uint256 inEscrow, uint256 held, uint256 reservedForBurn)",
  "function bind(address token_)",
  "function run()",
  "event Run(uint256 indexed run, uint256 ethClaimed, uint256 ethToDev, uint256 ethAddedToBurn)",
  "event Burned(uint256 indexed run, uint256 ethSpent, uint256 tokensBurned, uint256 totalSupplyAfter, bool onCurve)",
]);
const SUPPLY_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

export const burnerAddress = (env) => (ADDR.test(env.FEE_BURNER || "") ? env.FEE_BURNER : null);
// The official RPC answers 429 to Cloudflare Worker IPs, so public no-key providers go first.
const RPCS = ["https://robinhood.drpc.org", "https://robinhood-rpc.publicnode.com", "https://robinhood.rpc.blxrbdn.com", RPC];
const transport = (env) => fallback([...(env.RH_RPC_URL ? [env.RH_RPC_URL] : []), ...RPCS].map((u) => http(u, { retryCount: 1, retryDelay: 300, timeout: 8000 })));
export const client = (env) => createPublicClient({ chain, transport: transport(env) });
const SUMMARY_TTL = 60_000;

async function state(env, key) {
  const r = await env.DB.prepare("SELECT value FROM crawl_state WHERE key = ?").bind(key).first();
  return r ? r.value : null;
}
const setState = (env, key, value) =>
  env.DB.prepare("INSERT INTO crawl_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, String(value), Date.now()).run();

/** Copies new Run / Burned events into D1. Safe to call repeatedly. */
export async function indexBurns(env) {
  const address = burnerAddress(env);
  if (!address) return { skipped: "no burner" };
  const pc = client(env);
  const recorded = Number((await state(env, "burns_run")) || 0);
  const [runs, lastRun] = await Promise.all([
    pc.readContract({ address, abi: ABI, functionName: "runs" }),
    pc.readContract({ address, abi: ABI, functionName: "lastRun" }),
  ]);
  if (Number(runs) <= recorded) return { added: 0, runs: Number(runs) };

  // Free public RPCs cap eth_getLogs at 100 blocks, and run() is at most hourly, so locate the block of the
  // latest run from lastRun() and read the logs around it.
  const block = await blockAt(pc, Number(lastRun));
  const logs = [];
  for (let from = block - 200n; from <= block + 200n; from += 100n) {
    logs.push(...(await pc.getContractEvents({ address, abi: ABI, fromBlock: from, toBlock: from + 99n })));
  }
  const ts = Number(lastRun) * 1000;

  let added = 0;
  for (const l of logs) {
    const a = l.args;
    if (l.eventName === "Run") {
      await env.DB.prepare(
        "INSERT INTO burns (run, tx, block, at, eth_claimed, eth_to_dev, eth_to_burn) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run) DO UPDATE SET eth_claimed = excluded.eth_claimed, eth_to_dev = excluded.eth_to_dev, eth_to_burn = excluded.eth_to_burn"
      ).bind(Number(a.run), l.transactionHash, Number(l.blockNumber), ts, a.ethClaimed.toString(), a.ethToDev.toString(), a.ethAddedToBurn.toString()).run();
    } else if (l.eventName === "Burned") {
      await env.DB.prepare(
        "INSERT INTO burns (run, tx, block, at, eth_spent, tokens_burned, supply_after, on_curve) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run) DO UPDATE SET eth_spent = excluded.eth_spent, tokens_burned = excluded.tokens_burned, supply_after = excluded.supply_after, on_curve = excluded.on_curve"
      ).bind(Number(a.run), l.transactionHash, Number(l.blockNumber), ts, a.ethSpent.toString(), a.tokensBurned.toString(), a.totalSupplyAfter.toString(), a.onCurve ? 1 : 0).run();
    }
    added++;
  }
  if (added) await setState(env, "burns_run", runs);
  return { added, runs: Number(runs), block: Number(block) };
}

/** Block whose timestamp is about `ts` (seconds), found by secant steps on block time. */
export async function blockAt(pc, ts) {
  const head = await pc.getBlock();
  const hi = { n: head.number, t: Number(head.timestamp) };
  if (ts >= hi.t) return hi.n;
  const back = await pc.getBlock({ blockNumber: hi.n - 100_000n });
  let rate = 100_000 / Math.max(1, hi.t - Number(back.timestamp));
  let n = hi.n - BigInt(Math.round((hi.t - ts) * rate));
  for (let i = 0; i < 6; i++) {
    const b = await pc.getBlock({ blockNumber: n });
    const dt = Number(b.timestamp) - ts;
    if (Math.abs(dt) <= 1) return n;
    n -= BigInt(Math.round(dt * rate));
  }
  return n;
}

/** Calls bind() if needed and run() once the hour has passed and there is something to process. */
export async function keeper(env) {
  const address = burnerAddress(env);
  if (!address || !env.KEEPER_KEY) return { skipped: "no burner or keeper key" };
  const pc = client(env);
  const account = privateKeyToAccount(env.KEEPER_KEY);
  const wc = createWalletClient({ account, chain, transport: transport(env) });
  const send = async (functionName, args = []) => {
    const { request } = await pc.simulateContract({ address, abi: ABI, functionName, args, account });
    const hash = await wc.writeContract(request);
    await pc.waitForTransactionReceipt({ hash, timeout: 20_000 }).catch(() => {});
    return hash;
  };

  const token = await pc.readContract({ address, abi: ABI, functionName: "token" });
  if (token === ZERO) {
    if (!ADDR.test(env.TOKEN_ADDRESS || "")) return { skipped: "not bound" };
    return { bind: await send("bind", [env.TOKEN_ADDRESS]) };
  }
  const [wait, [inEscrow, held, reserved]] = await Promise.all([
    pc.readContract({ address, abi: ABI, functionName: "secondsUntilNextRun" }),
    pc.readContract({ address, abi: ABI, functionName: "pending" }),
  ]);
  if (wait > 0n) return { skipped: `next run in ${wait}s` };
  const fresh = inEscrow + held - reserved;
  const min = BigInt(env.KEEPER_MIN_WEI || "200000000000000");
  if (fresh < min && reserved === 0n) return { skipped: `only ${formatEther(fresh)} ETH pending` };
  return { run: await send("run") };
}

/** Cached for a minute; if the RPC fails, the last good read is returned with `stale: true`. */
export async function burnsSummary(env) {
  if (!burnerAddress(env)) return { live: false };
  const row = await env.DB.prepare("SELECT value, updated_at FROM crawl_state WHERE key = 'burns_summary'").first();
  if (row && Date.now() - row.updated_at < SUMMARY_TTL) return JSON.parse(row.value);
  try {
    const fresh = { ...(await readSummary(env)), readAt: new Date().toISOString() };
    await setState(env, "burns_summary", JSON.stringify(fresh));
    return fresh;
  } catch (e) {
    if (row) return { ...JSON.parse(row.value), stale: true, error: e.shortMessage || e.message };
    throw e;
  }
}

async function readSummary(env) {
  const address = burnerAddress(env);
  const pc = client(env);
  const read = (functionName) => pc.readContract({ address, abi: ABI, functionName });
  const [token, devWallet, runs, lastRun, wait, totalEthToDev, totalEthSpentOnBurns, totalTokensBurned, pend] = await Promise.all([
    read("token"), read("devWallet"), read("runs"), read("lastRun"), read("secondsUntilNextRun"),
    read("totalEthToDev"), read("totalEthSpentOnBurns"), read("totalTokensBurned"), read("pending"),
  ]);
  const totalSupply = token === ZERO ? null : await pc.readContract({ address: token, abi: SUPPLY_ABI, functionName: "totalSupply" });
  const { results } = await env.DB.prepare("SELECT * FROM burns ORDER BY run DESC LIMIT 500").all();
  return {
    live: true,
    contract: address,
    token: token === ZERO ? null : token,
    devWallet,
    explorer: EXPLORER,
    burnBps: 1500,
    intervalSec: 3600,
    runs: Number(runs),
    lastRun: lastRun > 0n ? new Date(Number(lastRun) * 1000).toISOString() : null,
    nextRunInSec: Number(wait),
    totals: {
      ethToDev: formatEther(totalEthToDev),
      ethSpentOnBurns: formatEther(totalEthSpentOnBurns),
      tokensBurned: formatEther(totalTokensBurned),
    },
    pending: { inEscrow: formatEther(pend[0]), held: formatEther(pend[1]), reservedForBurn: formatEther(pend[2]) },
    totalSupply: totalSupply === null ? null : formatEther(totalSupply),
    history: results.map((r) => ({
      run: r.run,
      tx: r.tx,
      block: r.block,
      at: new Date(r.at).toISOString(),
      ethClaimed: formatEther(BigInt(r.eth_claimed)),
      ethToDev: formatEther(BigInt(r.eth_to_dev)),
      ethToBurn: formatEther(BigInt(r.eth_to_burn)),
      ethSpent: formatEther(BigInt(r.eth_spent)),
      tokensBurned: formatEther(BigInt(r.tokens_burned)),
      supplyAfter: r.supply_after ? formatEther(BigInt(r.supply_after)) : null,
      onCurve: r.on_curve === null ? null : Boolean(r.on_curve),
    })),
  };
}
