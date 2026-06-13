const LANGUAGETOOL_URL = "https://api.languagetool.org/v2/check";
const MAX_TEXT_CHARS = 15_000; // well under the 20k public API limit

interface LTMatch {
  offset: number;
  length: number;
  rule: { issueType: string };
}

interface LTResponse {
  matches: LTMatch[];
}

let _cache: { key: string; result: Map<string, string[]> } | null = null;

async function getMisspelled(text: string, language: string): Promise<Set<string>> {
  const res = await fetch(LANGUAGETOOL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, language, enabledOnly: "false" }).toString(),
  });
  if (!res.ok) throw new Error(`LanguageTool (${language}): ${res.statusText}`);
  const data: LTResponse = await res.json();
  const words = new Set<string>();
  for (const m of data.matches) {
    if (m.rule.issueType === "misspelling") {
      words.add(text.slice(m.offset, m.offset + m.length).toLowerCase());
    }
  }
  return words;
}

/**
 * Checks an array of strings for spelling errors using LanguageTool.
 *
 * Only flags words that fail in BOTH pt-BR and en-US to avoid false positives:
 * "Silver" passes en-US → not flagged. "Preto" passes pt-BR → not flagged.
 * "marron" (not a word in either) → flagged.
 *
 * Returns a Map from each input string to its misspelled words.
 * Strings shorter than 3 chars and strings with no issues are omitted.
 * Results are cached in memory for the lifetime of the server process.
 */
export async function checkStrings(strings: string[]): Promise<Map<string, string[]>> {
  const unique = [
    ...new Set(strings.map((s) => s.trim()).filter((s) => s.length >= 3)),
  ];
  if (unique.length === 0) return new Map();

  const cacheKey = [...unique].sort().join("\0");
  if (_cache?.key === cacheKey) return _cache.result;

  // Trim to API character limit
  const lines: string[] = [];
  let total = 0;
  for (const s of unique) {
    if (total + s.length + 1 > MAX_TEXT_CHARS) break;
    lines.push(s);
    total += s.length + 1;
  }
  const text = lines.join("\n");

  const [ptBad, enBad] = await Promise.all([
    getMisspelled(text, "pt-BR"),
    getMisspelled(text, "en-US"),
  ]);

  // Intersection: only words rejected by both checkers
  const bothBad = new Set([...ptBad].filter((w) => enBad.has(w)));

  const result = new Map<string, string[]>();
  for (const s of unique) {
    const bad = s.split(/\s+/).filter((t) => bothBad.has(t.toLowerCase()));
    if (bad.length > 0) result.set(s, bad);
  }

  _cache = { key: cacheKey, result };
  return result;
}
