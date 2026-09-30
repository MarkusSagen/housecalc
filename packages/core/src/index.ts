import type { Market } from "./market.ts";
import { se } from "./markets/se/index.ts";

export type * from "./market.ts";
export { se };

export const markets: Record<string, Market> = { se };

export function getMarket(id: string): Market {
  const m = markets[id];
  if (!m) throw new Error(`Unknown market "${id}"`);
  return m;
}
