
export const OPENROUTER_MODELS = [
  "anthropic/claude-3-haiku",
  "google/gemma-2-9b-it",
  "meta-llama/llama-3-8b-instruct",
  "mistralai/mistral-7b-instruct",
  "openai/gpt-4o-mini",
  "microsoft/phi-3-medium-128k-instruct",
  "x-ai/grok-4-fast:free",
  "teknium/openhermes-2.5-mistral-7b",
  "cognitivecomputations/dolphin-mixtral-8x7b",
];

export const BOT_CONFIG = {
  gemini: {
    name: "Gemini",
    color: "from-blue-500 to-cyan-400",
  },
  lmstudio: {
    name: "LM Studio",
    color: "from-purple-500 to-indigo-400",
  },
  openrouter: {
    name: "OpenRouter",
    color: "from-green-500 to-emerald-400",
  },
  human: {
    name: "You",
    color: "from-slate-600 to-slate-500",
  },
  system: {
      name: "System",
      color: "from-yellow-500 to-amber-400",
  }
};