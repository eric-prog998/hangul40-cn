import assert from "node:assert/strict";
import test from "node:test";
import { compareRecall } from "../app/recall-logic.ts";

test("recall compares NFC text and ignores only surrounding whitespace for an exact match", () => {
  assert.equal(compareRecall("  한국어  ", "한국어"), "match");
  assert.equal(compareRecall("한국어".normalize("NFD"), "한국어"), "match");
});
test("empty recall is not an answer, including whitespace-only input", () => {
  for (const value of ["", " ", "\n\t"]) assert.equal(compareRecall(value, "네"), "empty");
});
test("spacing and final punctuation differences are distinguished, not silently graded correct", () => {
  assert.equal(compareRecall("안녕하세요", "안녕하세요."), "format");
  assert.equal(compareRecall("저는중국사람이에요！", "저는 중국 사람이에요."), "format");
  assert.equal(compareRecall("안녕  하세요", "안녕 하세요"), "format");
});
test("different text and other expressions remain different, never declared invalid Korean", () => {
  for (const [input, reference] of [["아니요", "네"], ["네", "예"], ["한구어", "한국어"], ["你好", "안녕하세요"], ["ㅎㅏㄴ", "한"], ["안녕.하세요", "안녕하세요"], ["!!!", "네"]]) assert.equal(compareRecall(input, reference), "different");
});
