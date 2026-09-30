import type { RateSource } from "../lib.ts";
import { handelsbanken } from "./handelsbanken.ts";
import { nordea } from "./nordea.ts";
import { sbab } from "./sbab.ts";
import { swedbank } from "./swedbank.ts";

// Banks not listed here keep their hand-maintained values in data/rates/se.json.
// Next candidates (see docs/superpowers/specs/2026-09-29-productionize-design.md):
// Länsförsäkringar, Danske Bank, Skandia (HTML); SEB, Avanza, ICA (need Playwright).
export const SE_SOURCES: RateSource[] = [handelsbanken, sbab, swedbank, nordea];
