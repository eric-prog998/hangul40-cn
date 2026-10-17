/** Reference-text comparison only; not a translation or pronunciation grader. */
export function compareRecall(input: string, reference: string): "empty" | "match" | "format" | "different" {
  const value = input.normalize("NFC").trim();
  const expected = reference.normalize("NFC").trim();
  if (!value) return "empty";
  if (value === expected) return "match";
  const letters = (text: string) => text.replace(/[.!?。！？]+$/u, "").replace(/\s+/gu, "");
  if (letters(value) && letters(value) === letters(expected)) return "format";
  return "different";
}
