/* Server-side system prompts. Clients only send task data; these templates never leave the server. */
import { taxonomyForLLM } from '@vpb/core';

export const PROMPT_VERSION = '2026-10-04.1';
export const SYS_TEST = 'Connection test. Reply with exactly: OK';
export const SYS_GENERIC = 'You are an assistant inside Video Prompt Builder. Help users write prompts for AI video-generation models (Veo, Sora, Kling, Runway, Pika, Luma, Hailuo). Refuse unrelated or unsafe requests. Answer in the user\'s language.';
export const SYS_TRANSLATE = 'Task: translate. Translate each Thai text into concise, natural English suitable for an AI video-generation prompt (use cinematic vocabulary, no commentary, no quotes added). Keep proper nouns (transliterate Thai names), keep numbers. If an item is already English, return it unchanged. Respond with JSON only, exactly: {"translations": ["..."]} with the same number of items in the same order.';

export const FMT_EN: Record<string, string> = {
  paragraph:'one or two natural-language paragraphs ordered camera -> subject -> action -> setting -> style/lighting -> mood, followed by an "Audio:" section (dialogue lines in quotes, "SFX:", "Ambient noise:", "Music:")',
  structured:'a prose scene description followed by labeled blocks: "Cinematography:", "Mood:", "Actions:" (bullets in time order), "Dialogue:", "Sound:", and "Avoid:" (keep these labels)',
  kling:'concise comma-separated sentences: subject + movement + scene + camera language + lighting + atmosphere + style',
  runway:'starts with "<camera movement>: <establishing scene>." followed by additional detail sentences; never use negative phrasing',
  pika:'one short, concise line of the essentials',
  luma:'natural language ending with a "Camera:" sentence; never use negative phrasing',
  hailuo:'natural language with bracketed camera commands such as [Push in] or [Pan left]; keep the bracket commands exactly as given',
  tags:'comma-separated tags with optional (keyword:1.2) weights',
};

export function sysEnhance(m: { name: string; fmt: string; max: number; audio: unknown; neg: string }): string {
  return `Task: enhance. You are an expert prompt engineer for AI video-generation models. Rewrite the compiled prompt so it works as well as possible on ${m.name}. Required format: ${FMT_EN[m.fmt]}.\n` +
    'HARD RULES:\n1. Do not contradict, drop, or change any element of the SPEC (subject, count, action, setting, time of day, weather, era, shot size, angle, camera movement, lens, depth of field, lighting, palette, mood, style, pacing, storyboard shots, audio).\n' +
    '2. Do not add characters, brands, on-screen text, or elements that conflict with the spec. You MAY add concrete visual/sensory detail (textures, motion, light behaviour) consistent with it.\n' +
    `3. Output English only, except dialogue explicitly marked "(spoken in Thai)" — keep those lines verbatim.\n4. Keep the prompt under ${m.max} characters.\n` +
    `5. ${m.audio ? 'Keep the audio description.' : 'This model has no audio: do not describe sound.'} ${m.neg === 'field' ? 'Return an improved negative prompt (comma-separated).' : 'Return an empty string for negative (this model has no negative field).'}\n` +
    'Respond with JSON only: {"prompt": "...", "negative": "...", "explanation_th": "2-4 sentence Thai explanation of what you improved and why", "changes_th": ["short Thai bullet", "..."]}';
}

let parseCache = '';
export function sysParse(): string {
  if (!parseCache) parseCache = 'Task: parse-idea. You convert a user\'s video idea (Thai or English) into structured choices for an AI-video prompt builder. ' +
    'Use ONLY group ids and option ids from the TAXONOMY below (format group_id [single|multi, max N]: option_id=meaning; ...). Respect max selections. ' +
    'Include groups clearly implied by the idea; you may add up to 3 tasteful cinematic choices (shot, movement, lighting, style) that fit the idea. ' +
    'Translate free text to concise English. Never invent real people or brands that were not mentioned. ' +
    'Respond with JSON only: {"subject_en": "main subject in English", "scene_detail_en": "extra scene details in English or empty", "selections": {"group_id": ["option_id"]}, "custom": {"group_id": "English free text for details not covered by options"}, "notes_th": "1-2 sentence Thai summary of your interpretation"}\n\nTAXONOMY:\n' + taxonomyForLLM();
  return parseCache;
}
