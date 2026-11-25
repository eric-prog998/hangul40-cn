import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {makeDayCards,recordDayCard,DAY_JAMO,emptyDayHistory,parseDayHistory,isDayCard,dayAudioPath,dayHearingOptions} from "../app/day-letters.ts";
import {addLocalDays} from "../app/review-logic.ts";
import {areBlendPartsEquivalent,decomposeHangulSyllable} from "../app/learning-logic.ts";

test("fresh v51 day builds six stable, independent tasks; existing check marks change order only", () => {
  const today = "2026-11-21", h = emptyDayHistory();
  const deck = makeDayCards(today,h,[]);
  assert.deepEqual(deck.map(c => c.skill), ["read","read","read","read","listen","keys"]);
  assert.deepEqual(deck,makeDayCards(today,h,[]));
  assert.equal(deck[0].char,"ㅏ");
  const old = makeDayCards(today,h,["ㅏ","ㄱ"]);
  assert.equal(old[0].char,"ㅓ");
  assert.deepEqual(h,{});
  assert.equal(new Set(DAY_JAMO).size,40);
});

test("independent progress, next-day transfer, replay weakness and a protected clock rollback", () => {
  const day = "2026-11-21", [card] = makeDayCards(day,{},[]);
  const key = card.char + ":" + card.skill;
  let h = recordDayCard({},card,day,"good",false);
  assert.deepEqual(Object.keys(h),[key]);
  assert.equal(h[key].stage,1);
  assert.equal(recordDayCard(h,card,day,"good",false)[key].stage,1);
  const tomorrow = addLocalDays(day,1);
  const warmup = makeDayCards(tomorrow,h,[])[0];
  assert.equal(warmup.char,card.char);
  assert.notEqual(warmup.example,card.example);
  h = recordDayCard(h,warmup,tomorrow,"good",false);
  assert.equal(h[key].stage,2);
  assert.equal(h[key].due,addLocalDays(tomorrow,4));
  assert.equal(recordDayCard(h,card,day,"again",false),h);
  h = recordDayCard(h,warmup,tomorrow,"good",true);
  assert.equal(h[key].stage,0);
  assert.equal(h[key].due,addLocalDays(tomorrow,1));
  const next = makeDayCards(addLocalDays(tomorrow,1),h,[]);
  assert.equal(next[0].char,card.char);
  assert.ok(next.filter(c => c.skill === "read" && c.char !== card.char).length >= 2);
});

test("across calendar boundaries 40 jamo are practiced, audio files exist, and no blind spelling guess is ambiguous", () => {
  let h = emptyDayHistory();
  for (let n=0;n<120;n++) {
    const day = addLocalDays("2026-11-21",n);
    const deck = makeDayCards(day,h,[]);
    assert.equal(deck.length,6);
    assert.equal(new Set(deck.map(c => c.char + ":" + c.skill)).size,6);
    for (const c of deck) {
      assert.ok(isDayCard(c),JSON.stringify(c));
      assert.ok(!["쇼", "쑈"].includes(c.example) && !["쇼", "쑈"].includes(c.alternative), "daily cards cannot teach or assess either disputed recording");
      assert.ok(existsSync(new URL("../public" + dayAudioPath(c), import.meta.url)),c.example);
      if (c.skill === "listen") {
        assert.ok(![..."ㅇㅐㅔㅒㅖㅚㅙㅞ"].includes(c.char));
        assert.equal(new Set(dayHearingOptions(c)).size,2);
        const a = decomposeHangulSyllable(c.example), b = decomposeHangulSyllable(c.alternative);
        assert.equal(areBlendPartsEquivalent(a.initial,a.vowel,b.initial,b.vowel),false);
      }
      h = recordDayCard(h,c,day,"good",false);
    }
  }
  for (const skill of ["read","keys"]) assert.equal(DAY_JAMO.filter(char => h[char + ":" + skill]).length,40);
  assert.equal(DAY_JAMO.filter(char => h[char + ":listen"]).length,32);
});

test("restoring persisted evidence and cards accepts only bounded, internally consistent entries", () => {
  const [c] = makeDayCards("2026-11-21",{},[]);
  const h = recordDayCard({},c,"2026-11-21","again",false), row = Object.values(h)[0];
  assert.deepEqual(parseDayHistory(JSON.parse(JSON.stringify(h))),h);
  assert.deepEqual(parseDayHistory({...h, "x:read":row, "ㅇ:listen":row, "ㅏ:keys":{...row,day:"2026-02-31"}}),h);
  for (const invalid of [null,[],42,"some text"]) assert.deepEqual(parseDayHistory(invalid),{});
  assert.equal(isDayCard({...c, example:"../bad"}),false);
  assert.equal(isDayCard({...c, skill:"listen", alternative:c.example}),false);
  assert.equal(isDayCard({...c, char:"ㅐ", example:"애", skill:"listen", alternative:"에"}),false);
});

test("a year of hearing cards is balanced per jamo and overall; saved choices never shuffle", () => {
  for (const missSome of [false, true]) {
    let history = emptyDayHistory();
    const perLetter = new Map(), total = [0, 0];
    for (let i = 0; i < 365; i++) {
      const day = addLocalDays("2026-11-22", i);
      const deck = makeDayCards(day,history,[]);
      for (const card of deck) {
        if (card.skill === "listen") {
          const opts = dayHearingOptions(card);
          assert.deepEqual(dayHearingOptions(JSON.parse(JSON.stringify(card))),opts);
          const side = opts.indexOf(card.example);
          assert.equal(side,card.correctSide);
          const count = perLetter.get(card.char) ?? [0,0];
          count[side]++; total[side]++; perLetter.set(card.char,count);
          assert.ok(Math.abs(count[0] - count[1]) <= 1);
        }
        history = recordDayCard(history, card, day, missSome && i % 5 === 0 ? "again" : "good", false);
      }
      history = parseDayHistory(JSON.parse(JSON.stringify(history)));
    }
    assert.equal(perLetter.size,32);
    assert.ok(Math.abs(total[0] - total[1]) <= 6, JSON.stringify(total));
  }
});

test("an unfinished legacy listening question retains its original answer position", () => {
  const card = { char:"ㅏ", skill:"listen", example:"아", alternative:"우" };
  assert.ok(isDayCard(card));
  assert.deepEqual(dayHearingOptions(card), ["아","우"]);
  assert.ok(!isDayCard({...card,correctSide:2}));
});
