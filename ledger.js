"use strict";

/**
 * 这顿 — split one shared meal into the fewest transfers.
 * Money is integer cents so remainders stay exact.
 */

var MAX_CENTS = 100000000;

function parseYuan(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    var cents = Math.round(input * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
    return cents;
  }
  if (typeof input !== "string") return null;
  var text = input.trim().replace(/[¥￥,\s]/g, "");
  if (!text || text.length > 12) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  var parts = text.split(".");
  var yuan = Number(parts[0]);
  var fen = Number(((parts[1] || "") + "00").slice(0, 2));
  if (!Number.isSafeInteger(yuan) || !Number.isSafeInteger(fen)) return null;
  var total = yuan * 100 + fen;
  if (total <= 0 || total > MAX_CENTS) return null;
  return total;
}

function formatYuan(cents) {
  var neg = cents < 0;
  var abs = Math.abs(cents);
  var yuan = Math.floor(abs / 100);
  var fen = String(abs % 100).padStart(2, "0");
  return (neg ? "-" : "") + yuan.toLocaleString("zh-CN") + "." + fen;
}

function allocate(cents, dinerIds, bonus) {
  var base = Math.floor(cents / dinerIds.length);
  var rem = cents % dinerIds.length;
  var shares = {};
  dinerIds.forEach(function (id) {
    shares[id] = base;
  });
  var order = dinerIds.map(function (id, index) {
    return { id: id, index: index, bonus: bonus[id] || 0 };
  });
  order.sort(function (a, b) {
    return a.bonus - b.bonus || a.index - b.index;
  });
  for (var i = 0; i < rem; i++) {
    var id = order[i].id;
    shares[id] += 1;
    bonus[id] = (bonus[id] || 0) + 1;
  }
  return shares;
}

function settle(meal) {
  var people = Array.isArray(meal.people) ? meal.people : [];
  var items = Array.isArray(meal.items) ? meal.items : [];
  var known = {};
  var bonus = {};
  var paid = {};
  var consumed = {};
  people.forEach(function (person) {
    known[person.id] = true;
    bonus[person.id] = 0;
    paid[person.id] = 0;
    consumed[person.id] = 0;
  });

  var warnings = [];
  var itemShares = {};
  var totalCents = 0;
  var bookedCents = 0;

  items.forEach(function (item) {
    var price = item.priceCents;
    var label = item.name || "这道菜";
    if (!Number.isInteger(price) || price <= 0) {
      warnings.push({ itemId: item.id, code: "bad-price", message: "「" + label + "」金额无效" });
      return;
    }
    totalCents += price;
    var diners = (item.dinerIds || []).filter(function (id, index, list) {
      return known[id] && list.indexOf(id) === index;
    });
    var payerOk = !!(item.payerId && known[item.payerId]);
    if (!diners.length) {
      warnings.push({ itemId: item.id, code: "no-diners", message: "「" + label + "」还没选谁吃了" });
      return;
    }
    if (!payerOk) {
      warnings.push({ itemId: item.id, code: "no-payer", message: "「" + label + "」还没记谁垫付" });
      return;
    }
    var shares = allocate(price, diners, bonus);
    itemShares[item.id] = shares;
    diners.forEach(function (id) {
      consumed[id] += shares[id];
    });
    paid[item.payerId] += price;
    bookedCents += price;
  });

  var rows = people.map(function (person) {
    return {
      id: person.id,
      name: person.name,
      paid: paid[person.id],
      consumed: consumed[person.id],
      balance: paid[person.id] - consumed[person.id],
    };
  });

  return {
    people: rows,
    transfers: transfersFrom(rows),
    warnings: warnings,
    itemShares: itemShares,
    totalCents: totalCents,
    bookedCents: bookedCents,
  };
}

function transfersFrom(rows) {
  var debtors = rows
    .filter(function (person) { return person.balance < 0; })
    .map(function (person) { return { id: person.id, name: person.name, left: -person.balance }; });
  var creditors = rows
    .filter(function (person) { return person.balance > 0; })
    .map(function (person) { return { id: person.id, name: person.name, left: person.balance }; });
  var byAmount = function (a, b) {
    return b.left - a.left || a.name.localeCompare(b.name, "zh");
  };
  debtors.sort(byAmount);
  creditors.sort(byAmount);

  var transfers = [];
  var i = 0;
  var j = 0;
  while (i < debtors.length && j < creditors.length) {
    var cents = Math.min(debtors[i].left, creditors[j].left);
    if (cents > 0) {
      transfers.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        fromName: debtors[i].name,
        toName: creditors[j].name,
        cents: cents,
      });
    }
    debtors[i].left -= cents;
    creditors[j].left -= cents;
    if (debtors[i].left === 0) i += 1;
    if (creditors[j].left === 0) j += 1;
  }
  return transfers;
}

function summaryText(meal, result) {
  var title = String(meal.title || "这顿").trim() || "这顿";
  var lines = ["【" + title + "】" + (meal.date || ""), "", "菜品"];
  var nameOf = function (id) {
    var person = (meal.people || []).find(function (p) { return p.id === id; });
    return person ? person.name : "";
  };
  (meal.items || []).forEach(function (item) {
    var payer = nameOf(item.payerId);
    var diners = (item.dinerIds || []).map(nameOf).filter(Boolean).join("、");
    lines.push(
      "- " + (item.name || "未命名") +
      "  ¥" + formatYuan(item.priceCents || 0) +
      "  " + (payer ? payer + "垫付" : "未记垫付") +
      " · " + (diners || "未选人")
    );
  });
  lines.push("");
  lines.push("合计 ¥" + formatYuan(result.totalCents));
  if (result.bookedCents !== result.totalCents) {
    lines.push("已入账 ¥" + formatYuan(result.bookedCents) + "，还有菜没记全");
  }
  lines.push("");
  lines.push("结算");
  result.warnings.forEach(function (warning) {
    lines.push("! " + warning.message);
  });
  if (!result.transfers.length) {
    lines.push(result.bookedCents ? "不用转账，已经平了。" : "还没有可以结算的菜。");
  } else {
    result.transfers.forEach(function (transfer) {
      lines.push(transfer.fromName + " → " + transfer.toName + "  ¥" + formatYuan(transfer.cents));
    });
  }
  return lines.join("\n");
}

function safeId(id, prefix) {
  var cleaned = String(id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (cleaned) return cleaned;
  return prefix + Math.random().toString(36).slice(2, 8);
}

function sanitizeMeal(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var people = [];
  var names = {};
  var ids = {};
  (raw.people || []).forEach(function (person) {
    if (!person || typeof person.name !== "string") return;
    var name = person.name.trim().slice(0, 20);
    if (!name || names[name]) return;
    var id = safeId(person.id, "p");
    if (ids[id]) return;
    names[name] = true;
    ids[id] = true;
    people.push({ id: id, name: name });
  });

  var items = [];
  var itemIds = {};
  (raw.items || []).forEach(function (item) {
    if (!item || typeof item.name !== "string") return;
    var name = item.name.trim().slice(0, 40);
    var price = item.priceCents;
    if (!name || !Number.isInteger(price) || price <= 0 || price > MAX_CENTS) return;
    var id = safeId(item.id, "i");
    if (itemIds[id]) return;
    itemIds[id] = true;
    var dinerIds = [];
    (item.dinerIds || []).forEach(function (dinerId) {
      if (ids[dinerId] && dinerIds.indexOf(dinerId) === -1) dinerIds.push(dinerId);
    });
    items.push({
      id: id,
      name: name,
      priceCents: price,
      payerId: ids[item.payerId] ? item.payerId : "",
      dinerIds: dinerIds,
    });
  });

  var title = String(raw.title || "").trim().slice(0, 40);
  if (!people.length && !items.length && !title) return null;
  var date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
  return {
    id: safeId(raw.id, "m"),
    title: title,
    date: date,
    people: people,
    items: items,
  };
}

function createDemoMeal() {
  return {
    id: "demo-hotpot",
    title: "周五火锅",
    date: "2026-10-09",
    people: [
      { id: "he", name: "阿禾" },
      { id: "lin", name: "小林" },
      { id: "zhou", name: "老周" },
      { id: "yuan", name: "圆圆" },
    ],
    items: [
      { id: "i1", name: "毛肚", priceCents: 12800, payerId: "he", dinerIds: ["he", "lin", "zhou", "yuan"] },
      { id: "i2", name: "肥牛", priceCents: 9600, payerId: "lin", dinerIds: ["he", "lin", "zhou"] },
      { id: "i3", name: "虾滑", priceCents: 7200, payerId: "zhou", dinerIds: ["he", "lin", "zhou", "yuan"] },
      { id: "i4", name: "油麦菜", priceCents: 2800, payerId: "yuan", dinerIds: ["he", "lin", "zhou", "yuan"] },
      { id: "i5", name: "啤酒", priceCents: 8400, payerId: "he", dinerIds: ["he", "lin", "zhou"] },
      { id: "i6", name: "米饭", priceCents: 1600, payerId: "lin", dinerIds: ["he", "lin", "zhou", "yuan"] },
    ],
  };
}

var api = {
  parseYuan: parseYuan,
  formatYuan: formatYuan,
  allocate: allocate,
  settle: settle,
  summaryText: summaryText,
  sanitizeMeal: sanitizeMeal,
  createDemoMeal: createDemoMeal,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.Zhedun = api;
