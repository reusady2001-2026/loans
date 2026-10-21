/* ============================================================================
   Lender scenarios (next stage F4 — a DRAFT): the arithmetic of extending today's loan with today's lender, and of a
   loan that must be dealt with. Pure: the caller hands in what the property earns, what is owed, the value (an appraisal
   or NOI ÷ cap rate), the lender's limits and which of them it uses, the new rate, and the lender's way with the
   early-payoff penalty. Nothing here reads or writes anything.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.RefiExtend = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function isNum(v){ return typeof v === "number" && isFinite(v); }
  function r2(x){ return Math.round(x * 100) / 100; }

  // The yearly payment on $1 amortizing over n months at a yearly rate (the loan constant), monthly 30/360.
  function loanConstant(rate, months){
    if (!(months > 0)) return null;
    var c = rate / 12;
    return c > 0 ? 12 * c / (1 - Math.pow(1 + c, -months)) : 12 / months;
  }

  // The most each limit allows, and the binding one among those the lender uses.
  // o: { noi, value, rate, amortMonths, limits:{dscr, dscrIO, ltv, dy}, off:[keys not used] }
  function size(o){
    var noi = o.noi, lim = o.limits || {}, off = o.off || [], k = loanConstant(o.rate, o.amortMonths || 360);
    var legs = {
      "DSCR": (noi > 0 && lim.dscr > 0 && k > 0) ? noi / (lim.dscr * k) : null,
      "DSCR IO": (noi > 0 && lim.dscrIO > 0 && o.rate > 0) ? noi / (lim.dscrIO * o.rate) : null,
      "LTV": (o.value > 0 && lim.ltv > 0) ? lim.ltv * o.value : null,
      "Debt Yield": (noi > 0 && lim.dy > 0) ? noi / lim.dy : null
    };
    var caps = Object.keys(legs).filter(function (key){ return isNum(legs[key]) && legs[key] > 0; })
      .map(function (key){ return { key: key, amt: legs[key], used: off.indexOf(key) < 0 }; })
      .sort(function (a, b){ return a.amt - b.amt; });
    var used = caps.filter(function (c){ return c.used; }); if (!used.length) used = caps;
    return { legs: legs, caps: caps, maxLoan: used.length ? used[0].amt : 0, binding: used.length ? used[0].key : null, constant: k };
  }

  // What the lender asks for the early-payoff penalty on an extension (D7, the operator's decision):
  // the full penalty (as if paid off), on the pay-down only, a part (a % of the full penalty, or a $ amount), or none.
  // Until one is picked it is the penalty on the pay-down, marked assumed.
  var PENALTY_HOWS = { full: "The full penalty", paydown: "On the pay-down only", pct: "A part — % of the full penalty", amt: "A part — a dollar amount", none: "None" };
  function penaltyOf(full, owed, payDown, choice){
    var c = choice || {}, how = PENALTY_HOWS[c.how] ? c.how : "paydown", assumed = !choice || !PENALTY_HOWS[c.how];
    full = isNum(full) ? Math.max(0, full) : 0;
    var amt, why;
    if (how === "full"){ amt = full; why = "the full early-payoff penalty, as if the loan were paid off"; }
    else if (how === "paydown"){ amt = (owed > 0) ? full * Math.max(0, payDown) / owed : 0; why = "the penalty on the part paid down (" + (owed > 0 ? (Math.round(Math.max(0, payDown) / owed * 10000) / 100) : 0) + "% of the balance)"; }
    else if (how === "pct"){ var p = isNum(c.pct) ? Math.max(0, Math.min(1, c.pct)) : 0; amt = full * p; why = (Math.round(p * 10000) / 100) + "% of the full penalty"; }
    else if (how === "amt"){ amt = isNum(c.amt) ? Math.max(0, c.amt) : 0; why = "the amount the lender asks"; }
    else { amt = 0; why = "no penalty"; }
    return { how: how, label: PENALTY_HOWS[how], amount: r2(amt), why: why, assumed: assumed, full: r2(full) };
  }
  function feeOf(amount, fee){
    var f = fee || {};
    if (f.kind === "amt") return r2(isNum(f.value) ? Math.max(0, f.value) : 0);
    return r2((isNum(f.value) ? Math.max(0, f.value) : 0) * Math.max(0, amount));
  }

  // Extend with today's lender. o: { owed, noi, value, rate, amortMonths, limits, off, penaltyFull, penalty, fee }
  function extend(o){
    var s = size(o), owed = isNum(o.owed) ? o.owed : 0;
    var allowed = s.maxLoan, payDown = (allowed > 0) ? Math.max(0, owed - allowed) : owed;
    var amount = Math.max(0, owed - payDown), noi = o.noi;
    var implied = amount > 0 ? {
      dscr: (s.constant > 0 && noi != null) ? noi / (amount * s.constant) : null,
      dscrIO: (o.rate > 0 && noi != null) ? noi / (amount * o.rate) : null,
      ltv: o.value > 0 ? amount / o.value : null,
      dy: noi != null ? noi / amount : null } : null;
    var pen = penaltyOf(o.penaltyFull, owed, payDown, o.penalty), fee = feeOf(amount, o.fee);
    return { owed: r2(owed), allowed: r2(allowed), binding: s.binding, legs: s.legs, caps: s.caps, constant: s.constant,
             payDown: r2(payDown), needed: payDown > 0.5, amount: r2(amount), implied: implied,
             penalty: pen, fee: fee, cash: r2(payDown + pen.amount + fee) };
  }

  // D1 (agreed as revised): a loan that must be dealt with — the property can't support what you owe, and today's loan
  // matures or its rate resets within the window (12 months).
  function mustAct(o){
    var w = isNum(o.windowMonths) ? o.windowMonths : 12;
    var mat = isNum(o.monthsToMaturity) && o.monthsToMaturity <= w, reset = isNum(o.monthsToReset) && o.monthsToReset >= 0 && o.monthsToReset <= w;
    return { must: !o.canCover && (mat || reset), maturing: mat, resetting: reset };
  }

  return { loanConstant: loanConstant, size: size, extend: extend, penaltyOf: penaltyOf, feeOf: feeOf, mustAct: mustAct, PENALTY_HOWS: PENALTY_HOWS };
});
