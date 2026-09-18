// OpenRouter's public model catalogue: GET https://openrouter.ai/api/v1/models
// lists every model with its pricing (USD per token), context length and
// supported parameters. No key needed. We use it to keep the menu's prices
// live; the numbers stored in constants.ts are the fallback when offline.

const MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface CatalogueEntry {
  id: string;
  name: string;
  contextLength: number;
  pricePerM: { input: number; output: number }; // USD per million tokens
}

let cached: Map<string, CatalogueEntry> | null = null;

export const fetchCatalogue = async (): Promise<Map<string, CatalogueEntry>> => {
  if (cached) return cached;
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter catalogue ${res.status}`);
  const { data } = (await res.json()) as {
    data: { id: string; name: string; context_length: number; pricing: { prompt: string; completion: string } }[];
  };
  cached = new Map(
    data.map((m) => [
      m.id,
      {
        id: m.id,
        name: m.name,
        contextLength: m.context_length,
        pricePerM: {
          input: Number(m.pricing.prompt) * 1e6,
          output: Number(m.pricing.completion) * 1e6,
        },
      },
    ])
  );
  return cached;
};
