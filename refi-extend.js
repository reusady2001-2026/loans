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
  // o: { noi, value, rate, amortMonths, limits:{dscr, dscrIO, ltv, dy}, off:[keys not used], ahead }
  // (2026-10-26, the operator: extensions of several loans together) ahead: { amount, constant, rate } — debt that sits
  // ahead of this loan on the same property (a mezzanine's senior). The lender's limits then apply to the two together,
  // as a mezzanine lender looks at them: what this loan may be is what the limits allow in all, less the debt ahead.
  function size(o){
    var noi = o.noi, lim = o.limits || {}, off = o.off || [], k = loanConstant(o.rate, o.amortMonths || 360);
    var a = o.ahead || null, aAmt = (a && a.amount > 0) ? a.amount : 0, aK = (a && a.constant > 0) ? a.constant : 0, aR = (a && a.rate > 0) ? a.rate : 0;
    var legs = {
      "DSCR": (noi > 0 && lim.dscr > 0 && k > 0) ? (noi / lim.dscr - aAmt * aK) / k : null,
      "DSCR IO": (noi > 0 && lim.dscrIO > 0 && o.rate > 0) ? (noi / lim.dscrIO - aAmt * aR) / o.rate : null,
      "LTV": (o.value > 0 && lim.ltv > 0) ? lim.ltv * o.value - aAmt : null,
      "Debt Yield": (noi > 0 && lim.dy > 0) ? noi / lim.dy - aAmt : null
    };
    // with debt ahead a limit can leave nothing for this loan: it allows $0 (it still binds), never a negative amount
    if (aAmt > 0) Object.keys(legs).forEach(function (key){ if (isNum(legs[key]) && legs[key] < 0) legs[key] = 0; });
    var caps = Object.keys(legs).filter(function (key){ return isNum(legs[key]) && (legs[key] > 0 || (aAmt > 0 && legs[key] === 0)); })
      .map(function (key){ return { key: key, amt: legs[key], used: off.indexOf(key) < 0 }; })
      .sort(function (a, b){ return a.amt - b.amt; });
    var used = caps.filter(function (c){ return c.used; }); if (!used.length) used = caps;
    return { legs: legs, caps: caps, maxLoan: used.length ? used[0].amt : 0, binding: used.length ? used[0].key : null, constant: k, ahead: aAmt > 0 ? { amount: aAmt, constant: aK, rate: aR } : null };
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

  // Extend with today's lender. o: { owed, noi, value, rate, amortMonths, limits, off, penaltyFull, penalty, fee, ahead }
  // With debt ahead (a mezzanine's senior), the coverage it shows is of the two loans together.
  function extend(o){
    var s = size(o), owed = isNum(o.owed) ? o.owed : 0, a = s.ahead;
    var allowed = s.maxLoan, payDown = (allowed > 0) ? Math.max(0, owed - allowed) : owed;
    var amount = Math.max(0, owed - payDown), noi = o.noi;
    var aAmt = a ? a.amount : 0, tot = amount + aAmt, ds = amount * s.constant + aAmt * (a ? a.constant : 0), dsIO = amount * o.rate + aAmt * (a ? a.rate : 0);
    var implied = amount > 0 ? {
      dscr: (s.constant > 0 && noi != null && ds > 0) ? noi / ds : null,
      dscrIO: (o.rate > 0 && noi != null && dsIO > 0) ? noi / dsIO : null,
      ltv: o.value > 0 ? tot / o.value : null,
      dy: noi != null ? noi / tot : null } : null;
    var pen = penaltyOf(o.penaltyFull, owed, payDown, o.penalty), fee = feeOf(amount, o.fee);
    return { owed: r2(owed), allowed: r2(allowed), binding: s.binding, legs: s.legs, caps: s.caps, constant: s.constant,
             payDown: r2(payDown), needed: payDown > 0.5, amount: r2(amount), implied: implied,
             penalty: pen, fee: fee, cash: r2(payDown + pen.amount + fee), ahead: a };
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
