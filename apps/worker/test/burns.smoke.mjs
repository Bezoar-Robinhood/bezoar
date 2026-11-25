// Live smoke test of the burns module against the deployed fee burner, with an in-memory D1 stand-in.
import { indexBurns, burnsSummary, blockAt, client } from "../src/burns.js";

const pc = client({});
const head = await pc.getBlockNumber();
for (const back of [3_000n, 40_000n, 2_000_000n]) {
  const b = await pc.getBlock({ blockNumber: head - back });
  const found = await blockAt(pc, Number(b.timestamp));
  console.log(`blockAt ${back} back: target ${b.number}, found ${found}, off by ${found - b.number} blocks`);
}

const kv = new Map();
const rows = [];
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => {
    const key = sql.includes("'burns_summary'") ? "burns_summary" : args[0];
    const v = sql.includes("crawl_state") ? kv.get(key) : null;
    return v ? { value: v.value, updated_at: v.t } : null;
  },
  run: async () => (sql.startsWith("INSERT INTO crawl_state") ? kv.set(args[0], { value: args[1], t: args[2] }) : rows.push(args)),
  all: async () => ({ results: [] }),
});
const env = { DB: { prepare: (sql) => stmt(sql) }, FEE_BURNER: process.argv[2] || "0x4e83596410b2d40802A4dF6014a6d46633A7c07e" };

console.log("index", await indexBurns(env));
console.log(JSON.stringify(await burnsSummary(env), null, 1));
