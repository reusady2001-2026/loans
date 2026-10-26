/* ============================================================================
   t12-check.js — the T12 "double reading" (2.9.7, #108). Pure, no I/O.

   Every new T12 is read twice: by the app's regular, rule-based reader (t12-parse +
   t12-classify) and — in the background — by the AI. This module
     • builds what the AI is given (the sheet, row by row) and the shape it answers in;
     • compares the two readings line by line: where each line belongs (income /
       expense / its category) and its amounts (the year and every month);
     • turns each disagreement into a review card, with what it does to the NOI;
     • applies the user's saved decisions to the regular reading, so the chosen
       figures flow into every calculation.
   The AI only checks; it never sets a number. Until the user decides a card, the
   regular reader's version is used.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.T12Check = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function r2(x){ return Math.round(x * 100) / 100; }
  function norm(s){ return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }

  // The categories a line can belong to (the app's own codes), with the role each implies.
  var INCOME_CODES = ["GPR","VAC","CONC","EMPL","MOD","BD","MTM","RUBS","TRSH RUB","TRSH COL","OTH","AMEN","PET","LATE","ADM","APP","PARK","COM","CAM","ANT"];
  var EXPENSE_CODES = ["RET","INS","UTIL","PAY","GA","BDX","MKT","RM","CS","MGMT","TRSH","CAB","PLL"];
  var OTHER = "NONOP";   // "something else": not part of the operating statement (below the line / capital)
  function roleOfCode(code){ return EXPENSE_CODES.indexOf(code) >= 0 ? "expense" : (code === OTHER ? "other" : "income"); }
  // 2.9.8 — the operator's own categories join the lists (the review's choices and the AI's allowed answers).
  var BASE_INCOME = INCOME_CODES.slice(), BASE_EXPENSE = EXPENSE_CODES.slice(), CUSTOM = [];
  function setCustom(list){
    CUSTOM = (list || []).filter(function (c){ return c && typeof c.code === "string" && c.label && (c.role === "income" || c.role === "expense"); });
    INCOME_CODES.length = 0; BASE_INCOME.forEach(function (c){ INCOME_CODES.push(c); });
    EXPENSE_CODES.length = 0; BASE_EXPENSE.forEach(function (c){ EXPENSE_CODES.push(c); });
    CUSTOM.forEach(function (c){ var a = c.role === "expense" ? EXPENSE_CODES : INCOME_CODES; if (a.indexOf(c.code) < 0) a.push(c.code); });
  }
  function instruction(){
    if (!CUSTOM.length) return INSTRUCTION;
    var side = function (r){ return CUSTOM.filter(function (c){ return c.role === r; }).map(function (c){ return c.code + " " + c.label; }).join(", "); };
    var inc = side("income"), exp = side("expense");
    return INSTRUCTION + " The operator's own categories (use one when a line is exactly that): " + (inc ? "income: " + inc + (exp ? "; " : "") : "") + (exp ? "expense: " + exp : "") + ".";
  }

  // ---- What the AI is given and how it answers -----------------------------------------------------
  // The T12 sheet, one line per sheet row, numbered the same way the regular reader numbers them
  // (row = position in the grid + 1), cells separated by " | ".
  function buildAiInput(grid, opts){
    opts = opts || {};
    var out = [];
    (grid || []).forEach(function (row, i){
      if (!Array.isArray(row)) return;
      var cells = row.map(function (c){ return c == null ? "" : String(c).trim(); });
      if (!cells.some(function (c){ return c !== ""; })) return;
      out.push("Row " + (i + 1) + ": " + cells.join(" | "));
    });
    return (opts.fileName ? "File: " + opts.fileName + "\n" : "") + out.join("\n");
  }
  var INSTRUCTION =
    "You are checking a property's trailing-twelve-month operating statement (T12), given below row by row " +
    "(\"Row N: cell | cell | …\"; the first rows are headers, including the month column headings). Read EVERY " +
    "detail line of the operating statement — skip headings, subtotal and total rows (TOTAL INCOME, TOTAL EXPENSES, " +
    "NET OPERATING INCOME and similar) and everything below NET OPERATING INCOME. For each detail line give: its row " +
    "number, its label exactly as printed, whether it is income or expense (or 'other' when it is not part of the " +
    "operating statement, e.g. a capital item), its category code from the list, its amount for the whole period " +
    "(the Total column; negative when the statement shows it negative or in parentheses), and its amount in every " +
    "month column as {month: 'YYYY-MM', amount}. Also give the statement's printed TOTAL INCOME, TOTAL EXPENSES and " +
    "NET OPERATING INCOME. Category codes — income: GPR gross potential rent, VAC vacancy, CONC concessions, EMPL " +
    "employee units, MOD model units, BD bad debt (income side), MTM month-to-month fees, RUBS utility reimbursements, " +
    "TRSH RUB trash reimbursements, TRSH COL trash collection income, OTH other income, AMEN amenity fees, PET pet fees, " +
    "LATE late fees, ADM administrative income, APP application fees, PARK parking, COM commercial rent, CAM CAM income, " +
    "ANT antenna income; expense: RET real estate taxes, INS insurance, UTIL utilities, PAY payroll, GA general & " +
    "administrative, BDX bad debt expense, MKT marketing, RM repairs & maintenance, CS contract services, MGMT " +
    "management fee, TRSH trash removal, CAB cable, PLL parking lot lease; NONOP not operating. Read the numbers " +
    "exactly as printed; never estimate, round or fill in a missing month.";
  function schema(){
    return {
      type: "object",
      properties: {
        lines: { type: "array", items: { type: "object", properties: {
          row: { type: "integer" }, label: { type: "string" },
          role: { type: "string", enum: ["income", "expense", "other"] },
          category: { type: "string", enum: INCOME_CODES.concat(EXPENSE_CODES, [OTHER]) },
          annual: { type: "number" },
          monthly: { type: "array", items: { type: "object", properties: { month: { type: "string" }, amount: { type: "number" } }, required: ["month", "amount"] } }
        }, required: ["row", "label", "role", "annual"] } },
        totals: { type: "object", properties: { income: { type: "number" }, expense: { type: "number" }, noi: { type: "number" } } }
      },
      required: ["lines"]
    };
  }

  // ---- The regular reading in the same shape -------------------------------------------------------
  // parsed = t12-parse.parseGrid(grid, {monthly:true}); classify(name, section, sub) -> {code, role, label}.
  function regularLines(parsed, classify){
    var out = [];
    ((parsed && parsed.rows) || []).forEach(function (r){
      if (!r) return;
      var c = classify ? classify(r.name, r.section, r.sub) : null;
      var isExp = String(r.section || "").toUpperCase().indexOf("EXP") >= 0;
      var code = c && c.code ? c.code : (isExp ? "GA" : "OTH");
      // the printed section decides the side, as the builder does (an income code under EXPENSES is G&A)
      var role = isExp ? "expense" : "income";
      if (role === "expense" && EXPENSE_CODES.indexOf(code) < 0) code = "GA";
      if (role === "income" && EXPENSE_CODES.indexOf(code) >= 0) code = "OTH";
      out.push({ row: (r.row != null ? r.row + 1 : null), label: r.name, section: r.section, sub: r.sub || "", role: role, code: code,
                 annual: isNum(r.amount) ? r.amount : 0, monthly: clone(r.monthly || {}) });
    });
    return out;
  }
  function aiMonthly(l){ var m = {}; (l && Array.isArray(l.monthly) ? l.monthly : []).forEach(function (x){ if (x && /^\d{4}-\d{2}$/.test(String(x.month)) && isNum(x.amount)) m[x.month] = x.amount; }); return m; }

  // NOI effect of booking `amount` under role `to` instead of role `from`.
  function sideSign(role){ return role === "income" ? 1 : (role === "expense" ? -1 : 0); }
  function noiEffect(fromRole, fromAmt, toRole, toAmt){ return r2(sideSign(toRole) * (toAmt || 0) - sideSign(fromRole) * (fromAmt || 0)); }

  // ---- Compare --------------------------------------------------------------------------------------
  // Returns { agree:boolean, cards:[…], totals:{regular, ai}, compared:N }.
  // card: { id, type: "belongs"|"amount", row, label, heading, regular:{role,code,annual,monthly}, ai:{role,code,annual,monthly}|null,
  //         months:[ym where the amounts differ], annualGap, noiEffect }
  function compare(regular, aiAnswer, opts){
    opts = opts || {};
    var tol = isNum(opts.tolerance) ? opts.tolerance : 1;   // under $1 is the same figure
    var ai = (aiAnswer && Array.isArray(aiAnswer.lines)) ? aiAnswer.lines : [];
    var used = {}, cards = [], n = 0;
    function findAi(reg){
      var i, best = -1;
      for (i = 0; i < ai.length; i++) if (!used[i] && ai[i] && ai[i].row === reg.row){ best = i; break; }
      if (best < 0) for (i = 0; i < ai.length; i++) if (!used[i] && ai[i] && norm(ai[i].label) === norm(reg.label)){ best = i; break; }
      if (best >= 0) used[best] = 1;
      return best >= 0 ? ai[best] : null;
    }
    regular.forEach(function (reg){
      n++;
      var a = findAi(reg), id = "r" + (reg.row != null ? reg.row : n);
      if (!a){
        if (Math.abs(reg.annual) >= tol) cards.push({ id: id, type: "amount", missing: true, row: reg.row, label: reg.label, heading: reg.sub || reg.section || "",
          regular: reg, ai: null, months: [], annualGap: r2(-reg.annual), noiEffect: noiEffect(reg.role, reg.annual, reg.role, 0) });
        return;
      }
      var aRole = a.role === "expense" ? "expense" : (a.role === "other" ? "other" : "income");
      var aCode = a.category || (aRole === "expense" ? "GA" : (aRole === "other" ? OTHER : "OTH"));
      var am = aiMonthly(a), months = [];
      var keys = {}; Object.keys(reg.monthly || {}).concat(Object.keys(am)).forEach(function (k){ keys[k] = 1; });
      Object.keys(keys).sort().forEach(function (ym){ var x = isNum(reg.monthly[ym]) ? reg.monthly[ym] : 0, y = isNum(am[ym]) ? am[ym] : 0; if (Math.abs(x - y) >= tol) months.push(ym); });
      var aAnnual = isNum(a.annual) ? a.annual : 0, gap = r2(aAnnual - reg.annual);
      var aiRead = { role: aRole, code: aCode, annual: aAnnual, monthly: am, label: a.label };
      var heading = reg.sub || reg.section || "";
      if (aRole !== reg.role || aCode !== reg.code){
        cards.push({ id: id, type: "belongs", row: reg.row, label: reg.label, heading: heading, regular: reg, ai: aiRead, months: months, annualGap: gap,
                     noiEffect: noiEffect(reg.role, reg.annual, aRole, aAnnual) });
      } else if (Math.abs(gap) >= tol || months.length){
        cards.push({ id: id, type: "amount", row: reg.row, label: reg.label, heading: heading, regular: reg, ai: aiRead, months: months, annualGap: gap,
                     noiEffect: noiEffect(reg.role, reg.annual, reg.role, aAnnual) });
      }
    });
    // Lines the AI read that the regular reader did not count (and that move a figure).
    ai.forEach(function (a, i){
      if (used[i] || !a || !isNum(a.annual) || Math.abs(a.annual) < tol || a.role === "other") return;
      var aRole = a.role === "expense" ? "expense" : "income";
      cards.push({ id: "a" + (a.row != null ? a.row : i), type: "belongs", extra: true, row: a.row, label: a.label, heading: "",
                   regular: { role: "other", code: OTHER, annual: 0, monthly: {}, label: a.label, row: a.row },
                   ai: { role: aRole, code: a.category || (aRole === "expense" ? "GA" : "OTH"), annual: a.annual, monthly: aiMonthly(a), label: a.label },
                   months: [], annualGap: r2(a.annual), noiEffect: noiEffect("other", 0, aRole, a.annual) });
    });
    return { agree: cards.length === 0, cards: cards, compared: n, totals: { ai: (aiAnswer && aiAnswer.totals) || null } };
  }

  // ---- Apply the user's decisions to the regular reading ----------------------------------------------
  // review.cards[i].decision = { role, code, annual, monthly } (what the line IS, as the user decided).
  // Each decided line is re-booked: its row is moved to the decided side/category and given the decided
  // amounts; the statement's printed totals move by the same amounts, so the NOI follows the decision
  // (the builder reconciles each section to its printed total). Undecided cards change nothing.
  function applyDecisions(parsed, review){
    if (!parsed || !review || !Array.isArray(review.cards)) return parsed;
    var decided = review.cards.filter(function (c){ return c && c.decision; });
    if (!decided.length) return parsed;
    var out = clone(parsed);
    out.rows = out.rows || []; out.totals = out.totals || {};
    var dInc = 0, dExp = 0, dMonths = {};
    function addMonths(role, monthly, sign){
      Object.keys(monthly || {}).forEach(function (ym){ if (!isNum(monthly[ym])) return; dMonths[ym] = dMonths[ym] || { inc: 0, exp: 0 }; if (role === "income") dMonths[ym].inc += sign * monthly[ym]; else if (role === "expense") dMonths[ym].exp += sign * monthly[ym]; });
    }
    decided.forEach(function (c){
      var d = c.decision, reg = c.regular || {}, idx = -1;
      for (var i = 0; i < out.rows.length; i++){ var r = out.rows[i]; if (r && reg.row != null && r.row + 1 === reg.row){ idx = i; break; } }
      if (idx < 0 && !c.extra) for (var j = 0; j < out.rows.length; j++){ if (out.rows[j] && norm(out.rows[j].name) === norm(c.label)){ idx = j; break; } }
      var oldRole = reg.role, oldAmt = isNum(reg.annual) ? reg.annual : 0, oldMonthly = reg.monthly || {};
      var newRole = d.role, newAmt = isNum(d.annual) ? d.annual : 0, newMonthly = d.monthly || {};
      // totals move by what leaves the old side and what lands on the new one
      if (oldRole === "income") dInc -= oldAmt; else if (oldRole === "expense") dExp -= oldAmt;
      if (newRole === "income") dInc += newAmt; else if (newRole === "expense") dExp += newAmt;
      addMonths(oldRole, oldMonthly, -1); addMonths(newRole, newMonthly, +1);
      if (idx >= 0){
        if (newRole === "other"){ out.rows.splice(idx, 1); return; }   // not part of the operating statement any more
        var row = out.rows[idx];
        row.amount = newAmt; row.monthly = clone(newMonthly);
        row.section = newRole === "expense" ? "EXPENSE" : "INCOME";
        row.forceCode = d.code; row.decided = true;
      } else if (newRole !== "other"){
        out.rows.push({ name: c.label, amount: newAmt, section: newRole === "expense" ? "EXPENSE" : "INCOME", sub: "", row: reg.row != null ? reg.row - 1 : null, monthly: clone(newMonthly), forceCode: d.code, decided: true });
      }
    });
    if (isNum(out.totals.income)) out.totals.income = r2(out.totals.income + dInc);
    if (isNum(out.totals.expense)) out.totals.expense = r2(out.totals.expense + dExp);
    if (isNum(out.totals.noi)) out.totals.noi = r2(out.totals.noi + dInc - dExp);
    if (out.totalsMonthly){
      Object.keys(dMonths).forEach(function (ym){
        var m = dMonths[ym];
        if (out.totalsMonthly.income && isNum(out.totalsMonthly.income[ym])) out.totalsMonthly.income[ym] = r2(out.totalsMonthly.income[ym] + m.inc);
        if (out.totalsMonthly.expense && isNum(out.totalsMonthly.expense[ym])) out.totalsMonthly.expense[ym] = r2(out.totalsMonthly.expense[ym] + m.exp);
        if (out.totalsMonthly.noi && isNum(out.totalsMonthly.noi[ym])) out.totalsMonthly.noi[ym] = r2(out.totalsMonthly.noi[ym] + m.inc - m.exp);
      });
    }
    out.decisionsApplied = decided.length;
    return out;
  }

  // Review status from the cards: "checked" once every card has a decision.
  function status(review){
    if (!review) return "none";
    if (review.status === "checking" || review.status === "unavailable" || review.status === "error") return review.status;
    var cards = Array.isArray(review.cards) ? review.cards : [];
    if (!cards.length) return "agree";
    return cards.every(function (c){ return c && c.decision; }) ? "checked" : "needs-review";
  }
  function pending(review){ return (review && Array.isArray(review.cards)) ? review.cards.filter(function (c){ return c && !c.decision; }).length : 0; }

  return { INSTRUCTION: INSTRUCTION, instruction: instruction, setCustom: setCustom, schema: schema, buildAiInput: buildAiInput, regularLines: regularLines, compare: compare,
           applyDecisions: applyDecisions, noiEffect: noiEffect, status: status, pending: pending, roleOfCode: roleOfCode,
           INCOME_CODES: INCOME_CODES, EXPENSE_CODES: EXPENSE_CODES, OTHER: OTHER };
});
