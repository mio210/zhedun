"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var ledger = require("./ledger");

test("parse yuan strings into cents", function () {
  assert.equal(ledger.parseYuan("88"), 8800);
  assert.equal(ledger.parseYuan("88.5"), 8850);
  assert.equal(ledger.parseYuan("88.50"), 8850);
  assert.equal(ledger.parseYuan("¥1,288.00"), 128800);
  assert.equal(ledger.parseYuan("  ￥12 "), 1200);
  assert.equal(ledger.parseYuan(""), null);
  assert.equal(ledger.parseYuan("0"), null);
  assert.equal(ledger.parseYuan("-5"), null);
  assert.equal(ledger.parseYuan("88.555"), null);
  assert.equal(ledger.parseYuan("abc"), null);
  assert.equal(ledger.parseYuan("1000001"), null);
});

test("leftover fen rotates instead of sticking to one person", function () {
  var bonus = { a: 0, b: 0, c: 0 };
  assert.deepEqual(ledger.allocate(100, ["a", "b", "c"], bonus), { a: 34, b: 33, c: 33 });
  assert.equal(bonus.a, 1);
  assert.deepEqual(ledger.allocate(100, ["a", "b", "c"], bonus), { a: 33, b: 34, c: 33 });
  assert.equal(bonus.b, 1);
});

test("two people split a dish the payer also ate", function () {
  var result = ledger.settle({
    people: [
      { id: "he", name: "阿禾" },
      { id: "lin", name: "小林" },
    ],
    items: [
      { id: "pot", name: "锅底", priceCents: 10000, payerId: "he", dinerIds: ["he", "lin"] },
    ],
  });
  assert.equal(result.people[0].balance, 5000);
  assert.equal(result.people[1].balance, -5000);
  assert.deepEqual(result.transfers, [
    { fromId: "lin", toId: "he", fromName: "小林", toName: "阿禾", cents: 5000 },
  ]);
  assert.match(ledger.summaryText({ title: "火锅", date: "2026-10-11", people: [{ id: "he", name: "阿禾" }, { id: "lin", name: "小林" }], items: [{ id: "pot", name: "锅底", priceCents: 10000, payerId: "he", dinerIds: ["he", "lin"] }] }, result), /小林 → 阿禾  ¥50\.00/);
});

test("someone can pay for a dish they did not eat", function () {
  var result = ledger.settle({
    people: [
      { id: "he", name: "阿禾" },
      { id: "lin", name: "小林" },
    ],
    items: [
      { id: "veg", name: "青菜", priceCents: 3000, payerId: "he", dinerIds: ["lin"] },
    ],
  });
  assert.equal(result.people[0].paid, 3000);
  assert.equal(result.people[0].consumed, 0);
  assert.equal(result.transfers[0].cents, 3000);
});

test("a dish without a payer or diners stays out of the settlement", function () {
  var result = ledger.settle({
    people: [
      { id: "he", name: "阿禾" },
      { id: "lin", name: "小林" },
    ],
    items: [
      { id: "a", name: "毛肚", priceCents: 8000, payerId: "", dinerIds: ["he", "lin"] },
      { id: "b", name: "啤酒", priceCents: 4000, payerId: "he", dinerIds: [] },
    ],
  });
  assert.equal(result.bookedCents, 0);
  assert.equal(result.totalCents, 12000);
  assert.equal(result.transfers.length, 0);
  assert.equal(result.warnings.length, 2);
  assert.equal(result.people[0].balance, 0);
});

test("balances sum to zero and transfers cover every debt", function () {
  var meal = ledger.createDemoMeal();
  var result = ledger.settle(meal);
  var balance = result.people.reduce(function (sum, person) { return sum + person.balance; }, 0);
  var owed = result.transfers.reduce(function (sum, transfer) { return sum + transfer.cents; }, 0);
  var positive = result.people.reduce(function (sum, person) {
    return sum + Math.max(person.balance, 0);
  }, 0);
  assert.equal(result.totalCents, 42400);
  assert.equal(result.bookedCents, 42400);
  assert.equal(result.warnings.length, 0);
  assert.equal(balance, 0);
  assert.equal(owed, positive);
  meal.items.forEach(function (item) {
    var shares = result.itemShares[item.id];
    var sum = Object.keys(shares).reduce(function (total, id) { return total + shares[id]; }, 0);
    assert.equal(sum, item.priceCents);
  });
});

test("mutual treats can cancel out", function () {
  var result = ledger.settle({
    people: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
      { id: "c", name: "丙" },
    ],
    items: [
      { id: "1", name: "一", priceCents: 3000, payerId: "a", dinerIds: ["a", "b"] },
      { id: "2", name: "二", priceCents: 3000, payerId: "b", dinerIds: ["b", "c"] },
      { id: "3", name: "三", priceCents: 3000, payerId: "c", dinerIds: ["c", "a"] },
    ],
  });
  assert.deepEqual(result.transfers, []);
  result.people.forEach(function (person) {
    assert.equal(person.balance, 0);
  });
});

test("sanitize drops broken rows and duplicate names", function () {
  var meal = ledger.sanitizeMeal({
    id: "bad id!",
    title: "  周五  ",
    date: "not-a-date",
    people: [
      { id: "a", name: "阿禾" },
      { id: "b", name: "阿禾" },
      { id: "c", name: "  " },
    ],
    items: [
      { id: "i1", name: "毛肚", priceCents: 1000, payerId: "a", dinerIds: ["a", "nobody", "a"] },
      { id: "i2", name: "空", priceCents: 0, payerId: "a", dinerIds: ["a"] },
    ],
  });
  assert.equal(meal.id, "badid");
  assert.equal(meal.title, "周五");
  assert.equal(meal.date, "");
  assert.deepEqual(meal.people, [{ id: "a", name: "阿禾" }]);
  assert.equal(meal.items.length, 1);
  assert.deepEqual(meal.items[0].dinerIds, ["a"]);
  assert.equal(ledger.sanitizeMeal({ people: [], items: [] }), null);
});
