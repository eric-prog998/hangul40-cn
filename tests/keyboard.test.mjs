import assert from "node:assert/strict";
import test from "node:test";
import { koreanKeyInput, koreanKeyLabel, resolveKoreanChoice, keyboardShortcutKey, keyboardSectionIndex, isImeConfirmation } from "../app/keyboard-logic.ts";

test("Korean physical keys work with Latin, Hangul and Process IME events", () => {
  for (const key of ["r", "R", "ㄱ", "Process", "Unidentified"]) {
    assert.deepEqual(koreanKeyInput(key, "KeyR"), { physical: "R", char: "ㄱ" });
    assert.deepEqual(koreanKeyInput(key, "KeyR", true), { physical: "R", char: "ㄲ" });
  }
  assert.deepEqual(koreanKeyInput("ㅁ", "KeyA"), { physical: "A", char: "ㅁ" });
  assert.deepEqual(koreanKeyInput("k", "KeyK"), { physical: "K", char: "ㅏ" });
  assert.deepEqual(koreanKeyInput("o", "KeyO", true), { physical: "O", char: "ㅒ" });
  assert.deepEqual(koreanKeyInput("ㅖ", ""), { physical: "P", char: "ㅖ" });
  assert.equal(koreanKeyInput("Dead", "KeyA"), null);
  assert.equal(koreanKeyInput("Enter", "Enter"), null);
  assert.equal(koreanKeyInput(" ", "Space"), null);
  assert.equal(keyboardShortcutKey("ㅁ", "KeyA"), "a", "ASDF option mode remains available with a Korean IME");
});

test("every one of the 40 jamo can be entered using the displayed key labels", () => {
  const letters = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"];
  assert.equal(new Set(letters).size, 40);
  for (const char of letters) {
    let pending = "";
    for (const part of koreanKeyLabel(char).split(" → ")) {
      const shifted = part.startsWith("Shift+");
      const key = part.replace("Shift+", "");
      const input = koreanKeyInput(key.toLowerCase(), `Key${key}`, shifted);
      assert.ok(input, `no key for ${char}`);
      pending = resolveKoreanChoice(pending, input.char, [char]).char;
    }
    assert.equal(pending, char);
  }
});

test("compound-vowel prefixes never submit the shorter option early", () => {
  const choices = ["ㅗ", "ㅘ", "ㅙ", "ㅏ"];
  assert.deepEqual(resolveKoreanChoice("", "ㅗ", choices), { char: "ㅗ", exact: true, canExtend: true, submit: false });
  assert.deepEqual(resolveKoreanChoice("ㅗ", "ㅏ", choices), { char: "ㅘ", exact: true, canExtend: false, submit: true });
  assert.equal(resolveKoreanChoice("ㅗ", "ㅐ", choices).char, "ㅙ");
  assert.equal(resolveKoreanChoice("", "ㅗ", ["ㅗ", "ㅏ"]).submit, true);
  assert.equal(resolveKoreanChoice("", "ㅜ", ["ㅞ", "ㅣ"]).submit, false);
  assert.equal(resolveKoreanChoice("ㅜ", "ㅔ", ["ㅞ", "ㅣ"]).submit, true);
  assert.equal(resolveKoreanChoice("", "ㄱ", ["ㄴ", "ㄷ"]).submit, false);
  assert.equal(resolveKoreanChoice("ㅗ", "ㄲ", ["ㄲ", "ㅘ"]).char, "ㄲ", "a new consonant discards an incomplete vowel");
});

test("section navigation uses shifted physical number keys only", () => {
  for (let index = 1; index <= 4; index++) {
    assert.equal(keyboardSectionIndex(`Digit${index}`, true), index);
    assert.equal(keyboardSectionIndex(`Digit${index}`, false), null);
  }
  assert.equal(keyboardSectionIndex("Digit5", true), null);
  assert.equal(keyboardSectionIndex("KeyR", true), null);
});

test("Korean IME confirmation never counts as a normal answer Enter", () => {
  assert.equal(isImeConfirmation(true, 13, false), true);
  assert.equal(isImeConfirmation(false, 229, false), true);
  assert.equal(isImeConfirmation(false, 13, true), true);
  assert.equal(isImeConfirmation(false, 13, false), false);
});
