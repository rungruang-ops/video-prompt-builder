// Loose typings for the shared JS core (the implementation is plain JS shared with the browser).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Spec = Record<string, any>;
export const GROUPS: Record<string, any>;
export const OPT: Record<string, any>;
export const STEPS: any[];
export const G2S: Record<string, any>;
export const MODELS: any[];
export const MOD: Record<string, any>;
export const PRESETS: Array<{ id: string; e: string; th: string; model: string; s: Spec }>;
export const RULES: any[];
export const WEIGHTS: Record<string, any>;
export const FORMATTERS: Record<string, (P: any, m: any) => string>;
export const trCache: Record<string, string>;
export const hooks: { canTranslate: () => boolean };
export let state: Spec;
export function blank(): Spec;
export function clone<T>(o: T): T;
export function esc(s: unknown): string;
export function isTh(s: unknown): boolean;
export function tr(s: string): string;
export function compile(model?: string, st?: Spec): { marked: string; prompt: string; negative: string; negAll: string[]; P: any; m: any };
export function evalConflicts(): { list: Array<{ lv: string; msg: string; fix?: any }>; bad: Set<string> };
export function score(conf: any): { s: number; miss: any[] };
export function thaiFields(): string[];
export function paramsObj(): Record<string, any>;
export function specJSON(): Record<string, any>;
export function thaiSummary(): string;
export function taxonomyForLLM(): string;
export function applyParsed(j: any): { sel: Record<string, string[]>; ai: Record<string, number>; custom: Record<string, string>; ignored: string[] };
export function setState(s: Spec): void;
export function getState(): Spec;
export function withState<T>(st: Spec, fn: () => T): T;
export function normalizeSpec(input: unknown): Spec;
export function analyze(spec: unknown, model?: string): {
  prompt: string; negative: string; negAll: string[]; model: string; format: string; maxChars: number;
  conflicts: Array<{ level: string; message: string }>; score: number; missing: string[]; params: Record<string, any>; spec: Record<string, any>;
};
