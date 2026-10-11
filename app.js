"use strict";

(function () {
  var Z = window.Zhedun;
  var KEY = "zhedun.v1";

  var state = load() || { meals: [], activeId: "", confirmDeleteId: "" };
  if (!state.meals.length) state.meals.push(blankMeal());
  if (!state.meals.some(function (meal) { return meal.id === state.activeId; })) {
    state.activeId = state.meals[0].id;
  }
  state.confirmDeleteId = "";

  var personDraft = "";
  var personError = "";
  var dishError = "";
  var copyNote = "";
  var importNote = "";
  var priceBuffer = {};
  var itemErrors = {};
  var draft = emptyDraft(active());
  var composing = false;
  var rendering = false;

  document.addEventListener("compositionstart", function () { composing = true; });
  document.addEventListener("compositionend", function () { composing = false; });
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("input", onInput);
  document.body.addEventListener("change", onChange);
  document.body.addEventListener("focusout", onBlur);
  document.body.addEventListener("submit", onSubmit);

  render();

  function blankMeal() {
    return { id: rid("m"), title: "", date: today(), people: [], items: [] };
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function rid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8);
  }

  function active() {
    return state.meals.find(function (meal) { return meal.id === state.activeId; }) || null;
  }

  function emptyDraft(meal) {
    var ids = meal ? meal.people.map(function (person) { return person.id; }) : [];
    return { name: "", price: "", payerId: ids[0] || "", dinerIds: ids.slice() };
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || !Array.isArray(raw.meals)) return null;
      var seen = {};
      var meals = [];
      raw.meals.forEach(function (meal) {
        var clean = Z.sanitizeMeal(meal);
        if (!clean || seen[clean.id]) return;
        seen[clean.id] = true;
        meals.push(clean);
      });
      if (!meals.length) return null;
      return { meals: meals, activeId: raw.activeId || meals[0].id };
    } catch (err) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: 1,
        meals: state.meals,
        activeId: state.activeId,
      }));
      importNote = importNote && importNote.indexOf("存不") === 0 ? "" : importNote;
    } catch (err) {
      importNote = "存不进这台浏览器，走之前先导出。";
    }
  }

  function resetEditors() {
    personDraft = "";
    personError = "";
    dishError = "";
    copyNote = "";
    priceBuffer = {};
    itemErrors = {};
    draft = emptyDraft(active());
  }

  function render(preferredFocus) {
    var saved = preferredFocus
      ? { key: preferredFocus, start: null, end: null }
      : captureFocus();
    rendering = true;
    document.getElementById("rail").innerHTML = railHTML();
    document.getElementById("sheet").innerHTML = sheetHTML();
    rendering = false;
    restoreFocus(saved);
  }

  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.focus) return null;
    var start = null;
    var end = null;
    try {
      start = el.selectionStart;
      end = el.selectionEnd;
    } catch (err) { /* selects have no caret */ }
    return { key: el.dataset.focus, start: start, end: end };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    var el = document.querySelector('[data-focus="' + saved.key + '"]');
    if (!el) return;
    el.focus();
    if (typeof saved.start === "number" && el.setSelectionRange) {
      try {
        var len = el.value.length;
        el.setSelectionRange(Math.min(saved.start, len), Math.min(saved.end, len));
      } catch (err) { /* date and select inputs */ }
    }
  }

  function railHTML() {
    var cards = state.meals.map(function (meal) {
      var result = Z.settle(meal);
      var title = meal.title.trim() || "还没起名";
      return (
        '<button type="button" class="meal-card' + (meal.id === state.activeId ? " active" : "") + '" data-open="' + meal.id + '">' +
          "<strong>" + esc(title) + "</strong>" +
          "<span>" + esc(meal.date || "没写日期") + " · " + meal.people.length + " 人 · ¥" + Z.formatYuan(result.totalCents) + "</span>" +
        "</button>" +
        (state.confirmDeleteId === meal.id
          ? '<button type="button" class="danger" data-delete-meal="' + meal.id + '">再点一次，删掉这顿</button>'
          : '<button type="button" class="text-btn" data-delete-meal="' + meal.id + '">删掉这顿</button>')
      );
    }).join("");
    return (
      "<h2>这几顿</h2>" +
      '<div class="rail-actions">' +
        '<button type="button" class="solid" id="new-meal">新开一顿</button>' +
        '<button type="button" class="ghost" id="load-demo">来一桌示例火锅</button>' +
      "</div>" +
      cards +
      '<div class="import-row">' +
        '<button type="button" class="text-btn" id="export-json">导出 JSON</button>' +
        '<label class="file ghost">导入 JSON<input id="import-file" type="file" accept="application/json,.json" /></label>' +
      "</div>" +
      (importNote ? '<p class="quiet">' + esc(importNote) + "</p>" : "")
    );
  }

  function sheetHTML() {
    var meal = active();
    var result = Z.settle(meal);
    return (
      '<article class="receipt paper">' +
        '<div class="seal" aria-hidden="true">' + esc(stampOf(meal, result)) + "</div>" +
        '<div class="receipt-top">' +
          '<label class="field">' +
            "<span>这顿</span>" +
            '<input class="title-input" id="meal-title" data-focus="title" maxlength="40" placeholder="比如：周五火锅" value="' + esc(meal.title) + '" />' +
          "</label>" +
          '<label class="field">' +
            "<span>日期</span>" +
            '<input id="meal-date" data-focus="date" type="date" value="' + esc(meal.date) + '" />' +
          "</label>" +
          '<div class="total-block">' +
            '<p class="section-label">合计</p>' +
            '<p class="total">¥' + Z.formatYuan(result.totalCents) + "</p>" +
            (result.bookedCents !== result.totalCents
              ? '<p class="warn">入账 ¥' + Z.formatYuan(result.bookedCents) + "，有菜还没记全</p>"
              : "") +
          "</div>" +
        "</div>" +
        peopleHTML(meal) +
        dishesHTML(meal, result) +
        balanceHTML(meal, result) +
        transferHTML(result) +
        wechatHTML(meal, result) +
      "</article>"
    );
  }

  function peopleHTML(meal) {
    var chips = meal.people.map(function (person) {
      return (
        '<span class="person">' + esc(person.name) +
          '<button type="button" data-remove-person="' + person.id + '" aria-label="去掉' + esc(person.name) + '">×</button>' +
        "</span>"
      );
    }).join("");
    return (
      '<section class="section">' +
        '<div class="section-head"><p class="section-label">谁在桌上</p></div>' +
        (chips ? '<div class="people">' + chips + "</div>" : '<p class="hint">先把名字写上。同名的人请加个称呼分开。</p>') +
        '<form id="person-form" class="inline">' +
          '<input id="person-name" data-focus="person-name" maxlength="20" placeholder="名字" value="' + esc(personDraft) + '" />' +
          '<button class="solid" type="submit">加上</button>' +
        "</form>" +
        (personError ? '<p class="error">' + esc(personError) + "</p>" : "") +
      "</section>"
    );
  }

  function dishesHTML(meal, result) {
    var rows = meal.items.map(function (item) {
      var price = Object.prototype.hasOwnProperty.call(priceBuffer, item.id)
        ? priceBuffer[item.id]
        : Z.formatYuan(item.priceCents);
      return (
        '<li class="dish">' +
          '<input data-focus="item-name-' + item.id + '" data-item-name="' + item.id + '" maxlength="40" value="' + esc(item.name) + '" aria-label="菜名" />' +
          '<input class="price" data-focus="item-price-' + item.id + '" data-item-price="' + item.id + '" inputmode="decimal" value="' + esc(price) + '" aria-label="金额" />' +
          payerSelect(meal, item.payerId, "data-item-payer=\"" + item.id + "\"", "谁垫的") +
          '<button type="button" class="text-btn remove" data-delete-item="' + item.id + '">删掉</button>' +
          '<div class="checks">' + dinerChecks(meal, item.dinerIds, "item", item.id) + "</div>" +
          '<p class="split">' + esc(shareLine(meal, item, result)) + "</p>" +
          (itemErrors[item.id] ? '<p class="error">' + esc(itemErrors[item.id]) + "</p>" : "") +
        "</li>"
      );
    }).join("");
    var form = meal.people.length
      ? (
        '<form id="dish-form" class="dish">' +
          '<input id="dish-name" data-focus="dish-name" maxlength="40" placeholder="菜名" value="' + esc(draft.name) + '" />' +
          '<input id="dish-price" class="price" data-focus="dish-price" inputmode="decimal" placeholder="金额" value="' + esc(draft.price) + '" />' +
          payerSelect(meal, draft.payerId, 'id="dish-payer" data-focus="dish-payer"', "谁垫的") +
          '<button class="solid" type="submit">记上</button>' +
          '<div class="checks">' + dinerChecks(meal, draft.dinerIds, "draft", "") + "</div>" +
        "</form>"
      )
      : '<p class="hint">人坐下之后才能记菜。</p>';
    return (
      '<section class="section">' +
        '<div class="section-head"><p class="section-label">菜</p></div>' +
        '<ul class="dishes">' + rows + "</ul>" +
        form +
        (dishError ? '<p class="error">' + esc(dishError) + "</p>" : "") +
      "</section>"
    );
  }

  function payerSelect(meal, selected, attrs, label) {
    var options = meal.people.map(function (person) {
      return '<option value="' + person.id + '"' + (person.id === selected ? " selected" : "") + ">" + esc(person.name) + "垫付</option>";
    }).join("");
    return '<select ' + attrs + ' aria-label="' + label + '">' +
      '<option value=""' + (selected ? "" : " selected") + ">谁垫的</option>" +
      options +
    "</select>";
  }

  function dinerChecks(meal, selected, kind, itemId) {
    return meal.people.map(function (person) {
      var attr = kind === "draft"
        ? 'data-draft-diner="' + person.id + '"'
        : 'data-item-diner="' + itemId + ":" + person.id + '"';
      var on = selected.indexOf(person.id) !== -1;
      return '<label class="check"><input type="checkbox" ' + attr + (on ? " checked" : "") + " />" + esc(person.name) + "</label>";
    }).join("");
  }

  function shareLine(meal, item, result) {
    var shares = result.itemShares[item.id];
    if (!shares) {
      var warning = result.warnings.find(function (itemWarning) { return itemWarning.itemId === item.id; });
      return warning ? warning.message : "";
    }
    return meal.people.filter(function (person) {
      return Object.prototype.hasOwnProperty.call(shares, person.id);
    }).map(function (person) {
      return person.name + " ¥" + Z.formatYuan(shares[person.id]);
    }).join("   ");
  }

  function balanceHTML(meal, result) {
    if (!meal.people.length) return "";
    var rows = result.people.map(function (person) {
      var diff = person.balance === 0
        ? '<span class="zero">平</span>'
        : person.balance > 0
          ? '<span class="plus">收回 ¥' + Z.formatYuan(person.balance) + "</span>"
          : '<span class="minus">应付 ¥' + Z.formatYuan(-person.balance) + "</span>";
      return (
        '<div class="balance"><span>' + esc(person.name) + "</span>" +
          '<span class="num">垫 ¥' + Z.formatYuan(person.paid) + "</span>" +
          '<span class="num">吃 ¥' + Z.formatYuan(person.consumed) + "</span>" +
          diff +
        "</div>"
      );
    }).join("");
    return '<section class="section"><p class="section-label">每人</p>' + rows + "</section>";
  }

  function transferHTML(result) {
    var body;
    if (!result.bookedCents) body = '<p class="hint">菜记全之后，这里写谁付给谁。</p>';
    else if (!result.transfers.length) body = '<p class="hint">这顿平了，谁也不用再转。</p>';
    else body = result.transfers.map(function (transfer) {
      return '<div class="transfer"><span>' + esc(transfer.fromName) + " 付给 " + esc(transfer.toName) + '</span><strong>¥' + Z.formatYuan(transfer.cents) + "</strong></div>";
    }).join("");
    return '<section class="section" id="settlement"><p class="section-label">转账</p>' + body + "</section>";
  }

  function wechatHTML(meal, result) {
    return (
      '<section class="section">' +
        '<div class="section-head"><p class="section-label">发到微信</p>' +
          '<button type="button" class="solid" id="copy-summary">复制</button></div>' +
        (copyNote ? '<p class="hint">' + esc(copyNote) + "</p>" : "") +
        '<pre class="wechat" id="wechat">' + esc(Z.summaryText(meal, result)) + "</pre>" +
      "</section>"
    );
  }

  function stampOf(meal, result) {
    if (!meal.items.length) return "开席";
    if (result.warnings.length) return "未齐";
    if (!result.transfers.length) return "已平";
    return "待付";
  }

  function onClick(event) {
    var t = event.target.closest("button");
    if (!t) return;
    if (t.id === "new-meal") return addMeal();
    if (t.id === "load-demo") return loadDemo();
    if (t.id === "export-json") return exportJson();
    if (t.id === "copy-summary") return copySummary();
    if (t.dataset.open) return openMeal(t.dataset.open);
    if (t.dataset.deleteMeal) return deleteMeal(t.dataset.deleteMeal);
    if (t.dataset.removePerson) return removePerson(t.dataset.removePerson);
    if (t.dataset.deleteItem) return deleteItem(t.dataset.deleteItem);
  }

  function onInput(event) {
    if (composing) return;
    var t = event.target;
    var value = t.value;
    var meal = active();
    if (!meal) return;
    if (t.id === "meal-title") {
      meal.title = value.slice(0, 40);
      save();
      render();
      return;
    }
    if (t.id === "person-name") {
      personDraft = value.slice(0, 20);
      personError = "";
      return;
    }
    if (t.id === "dish-name") {
      draft.name = value.slice(0, 40);
      dishError = "";
      return;
    }
    if (t.id === "dish-price") {
      draft.price = value.slice(0, 12);
      dishError = "";
      return;
    }
    if (t.dataset.itemName) {
      var named = findItem(t.dataset.itemName);
      if (!named) return;
      named.name = value.slice(0, 40);
      save();
      render();
      return;
    }
    if (t.dataset.itemPrice) {
      setItemPrice(t.dataset.itemPrice, value);
    }
  }

  function onChange(event) {
    var t = event.target;
    var meal = active();
    if (!meal) return;
    if (t.id === "meal-date") {
      meal.date = t.value;
      save();
      render();
      return;
    }
    if (t.id === "dish-payer") {
      draft.payerId = t.value;
      return;
    }
    if (t.dataset.draftDiner) {
      toggle(draft.dinerIds, t.dataset.draftDiner, t.checked);
      return;
    }
    if (t.dataset.itemPayer) {
      var paid = findItem(t.dataset.itemPayer);
      if (!paid) return;
      paid.payerId = t.value;
      save();
      render();
      return;
    }
    if (t.dataset.itemDiner) {
      var parts = t.dataset.itemDiner.split(":");
      var eaten = findItem(parts[0]);
      if (!eaten) return;
      toggle(eaten.dinerIds, parts[1], t.checked);
      save();
      render();
      return;
    }
    if (t.id === "import-file" && t.files && t.files[0]) importJson(t.files[0]);
  }

  function onBlur(event) {
    if (rendering) return;
    var id = event.target.dataset ? event.target.dataset.itemPrice : "";
    if (!id || !Object.prototype.hasOwnProperty.call(priceBuffer, id)) return;
    if (parseOk(priceBuffer[id])) {
      delete priceBuffer[id];
      delete itemErrors[id];
    } else {
      itemErrors[id] = "金额写成 88 或 88.50";
    }
    setTimeout(function () { render(); }, 0);
  }

  function onSubmit(event) {
    if (event.target.id === "person-form") {
      event.preventDefault();
      addPerson();
    }
    if (event.target.id === "dish-form") {
      event.preventDefault();
      addDish();
    }
  }

  function toggle(list, id, on) {
    var index = list.indexOf(id);
    if (on && index === -1) list.push(id);
    if (!on && index !== -1) list.splice(index, 1);
  }

  function findItem(id) {
    var meal = active();
    return meal.items.find(function (item) { return item.id === id; }) || null;
  }

  function parseOk(text) {
    return Z.parseYuan(text || "") !== null;
  }

  function setItemPrice(id, text) {
    var item = findItem(id);
    if (!item) return;
    priceBuffer[id] = text.slice(0, 12);
    var cents = Z.parseYuan(priceBuffer[id]);
    if (cents) {
      item.priceCents = cents;
      delete itemErrors[id];
      save();
    }
    render();
  }

  function addPerson() {
    var meal = active();
    var name = personDraft.trim().slice(0, 20);
    if (!name) {
      personError = "写个名字";
      render("person-name");
      return;
    }
    if (meal.people.some(function (person) { return person.name === name; })) {
      personError = "桌上已经有这个名字";
      render("person-name");
      return;
    }
    var id = rid("p");
    meal.people.push({ id: id, name: name });
    if (draft.dinerIds.indexOf(id) === -1) draft.dinerIds.push(id);
    if (!draft.payerId) draft.payerId = id;
    personDraft = "";
    personError = "";
    state.confirmDeleteId = "";
    save();
    render("person-name");
  }

  function removePerson(id) {
    var meal = active();
    meal.people = meal.people.filter(function (person) { return person.id !== id; });
    meal.items.forEach(function (item) {
      item.dinerIds = item.dinerIds.filter(function (dinerId) { return dinerId !== id; });
      if (item.payerId === id) item.payerId = "";
    });
    draft.dinerIds = draft.dinerIds.filter(function (dinerId) { return dinerId !== id; });
    if (draft.payerId === id) draft.payerId = meal.people[0] ? meal.people[0].id : "";
    save();
    render();
  }

  function addDish() {
    var meal = active();
    var name = draft.name.trim().slice(0, 40);
    var cents = Z.parseYuan(draft.price);
    if (!meal.people.length) {
      dishError = "先写上谁在桌上";
      render();
      return;
    }
    if (!name) {
      dishError = "这道菜叫什么";
      render("dish-name");
      return;
    }
    if (!cents) {
      dishError = "金额写成 88 或 88.50";
      render("dish-price");
      return;
    }
    if (!draft.payerId) {
      dishError = "选一下谁垫的";
      render("dish-payer");
      return;
    }
    if (!draft.dinerIds.length) {
      dishError = "至少选一个吃的人";
      render();
      return;
    }
    meal.items.push({
      id: rid("i"),
      name: name,
      priceCents: cents,
      payerId: draft.payerId,
      dinerIds: draft.dinerIds.slice(),
    });
    draft.name = "";
    draft.price = "";
    dishError = "";
    state.confirmDeleteId = "";
    save();
    render("dish-name");
  }

  function deleteItem(id) {
    var meal = active();
    meal.items = meal.items.filter(function (item) { return item.id !== id; });
    delete priceBuffer[id];
    delete itemErrors[id];
    save();
    render();
  }

  function addMeal() {
    var meal = blankMeal();
    state.meals.unshift(meal);
    state.activeId = meal.id;
    state.confirmDeleteId = "";
    resetEditors();
    save();
    render("title");
  }

  function openMeal(id) {
    if (id === state.activeId) return;
    state.activeId = id;
    state.confirmDeleteId = "";
    resetEditors();
    save();
    render("title");
  }

  function deleteMeal(id) {
    if (state.confirmDeleteId !== id) {
      state.confirmDeleteId = id;
      render();
      return;
    }
    state.meals = state.meals.filter(function (meal) { return meal.id !== id; });
    if (!state.meals.length) state.meals.push(blankMeal());
    if (!state.meals.some(function (meal) { return meal.id === state.activeId; })) {
      state.activeId = state.meals[0].id;
    }
    state.confirmDeleteId = "";
    resetEditors();
    save();
    render();
  }

  function loadDemo() {
    var demo = Z.createDemoMeal();
    demo.id = rid("m");
    demo.items.forEach(function (item) { item.id = rid("i"); });
    var meal = active();
    if (meal && !meal.people.length && !meal.items.length && !meal.title.trim()) {
      demo.id = meal.id;
      var index = state.meals.indexOf(meal);
      state.meals[index] = demo;
    } else {
      state.meals.unshift(demo);
      state.activeId = demo.id;
    }
    state.confirmDeleteId = "";
    resetEditors();
    save();
    render();
  }

  function copySummary() {
    var text = document.getElementById("wechat").textContent;
    var done = function (note) {
      copyNote = note;
      render();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        done("已复制，去微信粘贴。");
      }).catch(function () {
        done("剪贴板没打开，文字在下面，选中即可复制。");
      });
      return;
    }
    done("文字在下面，选中即可复制。");
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify({ version: 1, meals: state.meals }, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "zhedun.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(String(reader.result || ""));
        var list = Array.isArray(raw) ? raw : raw.meals;
        if (!Array.isArray(list)) throw new Error("shape");
        var seen = {};
        var meals = [];
        list.slice(0, 200).forEach(function (meal) {
          var clean = Z.sanitizeMeal(meal);
          if (!clean || seen[clean.id]) return;
          seen[clean.id] = true;
          meals.push(clean);
        });
        if (!meals.length) throw new Error("empty");
        state.meals = meals;
        state.activeId = meals[0].id;
        state.confirmDeleteId = "";
        resetEditors();
        importNote = "导入了 " + meals.length + " 顿。";
        save();
        render();
      } catch (err) {
        importNote = "这个文件不是这顿导出的账。";
        render();
      }
    };
    reader.readAsText(file);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
