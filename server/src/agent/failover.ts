import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDirs, paths } from "../config.js";
import { type ModelSummary, listModels } from "./runtime.js";

/** How long a model stays on the bench after its quota ran out. */
const BENCH_MS = 6 * 60 * 60 * 1000;

/**
 * Errors that mean "this account is out of quota", not "the network hiccuped". On these the run
 * switches to another model instead of showing the student a dead end.
 */
const QUOTA_PATTERN = new RegExp(
  [
    "insufficient_quota",
    "quota exceeded",
    "out of budget",
    "free.?usage.?limit",
    "usage.?limit.?reached",
    "monthly usage limit",
    "available balance",
    "insufficient (?:credits|balance|funds)",
    "exceeded your current quota",
    "billing",
    "payment required",
    "credit balance is too low",
    "no credits",
    "402",
  ].join("|"),
  "i",
);

export function isQuotaError(message: string): boolean {
  return QUOTA_PATTERN.test(message);
}

/* -------------------------------------------------------------------------------------------------
 * Which models count as free
 * -----------------------------------------------------------------------------------------------*/

/** Providers whose plans include a usable free tier. */
const FREE_TIER_PROVIDERS = new Set(["openrouter", "kilo", "groq", "cerebras", "google", "gemini"]);

/** A model name that says it is the free variant. `:free`, `free`, `kilo-auto/free`. */
function looksFree(model: ModelSummary): boolean {
  return /(^|[^a-z])(?::free|free)([^a-z]|$)/i.test(model.id) || /free/i.test(model.name);
}

/**
 * Rank a model as a fallback. Lower is better; `0` is not a candidate.
 * Free variants first, then free-tier providers, then anything the user configured.
 */
function fallbackRank(model: ModelSummary): number {
  if (!model.configured) return 0;
  if (looksFree(model)) return 3;
  if (FREE_TIER_PROVIDERS.has(model.provider)) return 2;
  return 1;
}

/* -------------------------------------------------------------------------------------------------
 * Exhausted models, kept across restarts
 * -----------------------------------------------------------------------------------------------*/

type BenchFile = Record<string, number>;

function benchPath() {
  return `${paths.dataDir}/quota-bench.json`;
}

function readBench(): BenchFile {
  if (!existsSync(benchPath())) return {};
  try {
    const raw = JSON.parse(readFileSync(benchPath(), "utf8")) as BenchFile;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

function writeBench(bench: BenchFile): void {
  ensureDirs();
  writeFileSync(benchPath(), JSON.stringify(bench, null, 2) + "\n", "utf8");
}

export function isBenched(ref: string): boolean {
  return Boolean(readBench()[ref]);
}

export function benchModel(ref: string): void {
  const bench = readBench();
  bench[ref] = Date.now() + BENCH_MS;
  writeBench(bench);
}

/** The student picked this model on purpose: let it try again. */
export function unbenchModel(ref: string): void {
  const bench = readBench();
  if (!bench[ref]) return;
  delete bench[ref];
  writeBench(bench);
}

/* -------------------------------------------------------------------------------------------------
 * Picking the next model
 * -----------------------------------------------------------------------------------------------*/

/**
 * The best configured model to use after `failed` runs out, skipping whatever is already on the
 * bench. Returns undefined when nothing else is configured.
 */
export async function pickFallback(failed: string): Promise<string | undefined> {
  let models: ModelSummary[];
  try {
    models = await listModels();
  } catch {
    return undefined;
  }
  const bench = readBench();
  const candidates = models
    .map((model) => ({ ref: `${model.provider}/${model.id}`, rank: fallbackRank(model) }))
    .filter((entry) => entry.rank > 0 && entry.ref !== failed && !bench[entry.ref])
    .sort((a, b) => b.rank - a.rank);
  return candidates[0]?.ref;
}