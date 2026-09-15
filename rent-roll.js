/* ============================================================================
   Rent-roll parser — turns a multifamily rent-roll sheet (a 2-D grid of cells,
   e.g. SheetJS sheet_to_json({header:1})) into clean per-unit records plus the
   unit statistics an underwriter reads off a rent roll.

   The rules come straight from the 9/10 walkthrough with Azriel (Living
   Residential), who does this by hand every month:

   • A rent roll is "every tenant, which unit they're in, what type of unit it
     is, how many square feet the unit is" — one ROW per unit, with a market
     (asking) rent and the actual (in-place/current) rent that unit is leased at.

   • GROSS POTENTIAL RENT is the GROSSED-UP rent roll: the market rent of EVERY
     residential unit — vacant units included, valued at their market/asking rent
     ("this unit has a 1770 market rent, right now it's zero; when someone rents
     it that's what they'll rent it for") — summed and annualized (×12).

   • The AVERAGE ACTUAL rent EXCLUDES vacant (zero-rent) units — "you have to
     exclude the zeros… you don't want the vacancies to weigh down the average."
     The average MARKET rent is over all units (vacant units still have a market
     rent).

   • Commercial space is "relevant to the NOI, but not to the per-unit
     calculations and the residential" — so commercial rows are kept for their
     income but excluded from residential unit counts, GPR and the per-unit
     averages.

   • UNIT STATISTICS is by UNIT TYPE (not each individual unit): for each type,
     the unit count, what percent is occupied, average square feet, occupied
     square feet, average market rent and average occupied (actual) rent.

   Deterministic column detection by header keywords; never throws — junk, empty
   or header-less input yields an empty parse with the same shape. Anything the
   parser can't square (a unit with no type, an actual rent above its market
   rent, a missing rent) is LISTED in `warnings`, never silently dropped and
   never judged against a hard-coded threshold.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.RentRoll = api;
  if (typeof globalThis !== "undefined") globalThis.RentRoll = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function str(v){ return (v == null || typeof v === "object" || typeof v === "boolean") ? "" : String(v).trim(); }
  function low(v){ return str(v).toLowerCase(); }
  // A money/number cell → number, or null. Handles "$1,770.00", "(1,234)", accounting "-", blanks.
  function toNum(v){
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var s = v.replace(/[\s$€£]/g, ""); if (!s) return null;
    if (/^[-–—]+$/.test(s)) return 0;                       // accounting zero
    if (!/\d/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || s.indexOf("-") >= 0;
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function round2(n){ return Math.round(n * 100) / 100; }
  function mean(arr){ return arr.length ? arr.reduce(function(a,b){ return a + b; }, 0) / arr.length : null; }

  // Header-column detection. Each field is a list of matchers tried against the
  // lower-cased header text; the FIRST column that matches wins, and a column is
  // used for at most one field (rent columns are claimed market-first so a plain
  // "Rent" left over is read as the actual rent).
  var COLSPEC = [
    { key: "unit",    any: [/^unit(\s|$|#|no|id)/, /apt|apartment|door|space\b/, /^unit$/] },
    { key: "type",    any: [/floor\s*plan/, /unit\s*type/, /\btype\b/, /\bplan\b/, /layout|style|model/, /bed(room)?s?\b/] },
    { key: "sqft",    any: [/sq\.?\s*ft|sq\.?\s*feet|square\s*f|\bsf\b|\bsqft\b|\barea\b/] },
    { key: "market",  any: [/market\s*rent/, /gross\s*(potential\s*)?rent/, /asking\s*rent/, /\bgpr\b/, /market$/] },
    { key: "actual",  any: [/actual\s*rent/, /current\s*rent/, /in.?place\s*rent/, /lease(d)?\s*rent/, /charged\s*rent/, /tenant\s*rent/, /rent\s*charged/, /^rent$/, /\brent\b/] },
    { key: "status",  any: [/status/, /occup/, /vacan/, /lease\s*status/] },
    { key: "tenant",  any: [/tenant|resident|name\b|lessee/] }
  ];
  var COMMERCIAL_RE = /commercial|retail|\bcomm\b|store|office|tenant\s*commercial|nnn/;

  // Score a row as a potential header: how many distinct fields its cells match.
  function scoreHeaderRow(row){
    if (!row) return { score: 0, map: {} };
    var used = {}, map = {}, score = 0;
    for (var s = 0; s < COLSPEC.length; s++){
      var spec = COLSPEC[s];
      for (var c = 0; c < row.length; c++){
        if (used[c]) continue;
        var h = low(row[c]); if (!h) continue;
        var hit = spec.any.some(function(re){ return re.test(h); });
        if (hit){ map[spec.key] = c; used[c] = 1; score++; break; }
      }
    }
    return { score: score, map: map };
  }

  // Find the header row: the row (scanning the first ~40) that maps the most
  // fields AND names at least a unit-ish column plus one rent column — a rent
  // roll always has those. Returns { headerRow, map } or { headerRow:-1 }.
  function findHeader(grid){
    if (!grid || !grid.length) return { headerRow: -1, map: {} };
    var best = { score: 0, map: {}, row: -1 };
    var lim = Math.min(grid.length, 40);
    for (var r = 0; r < lim; r++){
      var res = scoreHeaderRow(grid[r]);
      var hasUnitish = res.map.unit != null || res.map.type != null;
      var hasRent = res.map.market != null || res.map.actual != null;
      if (res.score > best.score && hasUnitish && hasRent){ best = { score: res.score, map: res.map, row: r }; }
    }
    return { headerRow: best.row, map: best.map };
  }

  // A blank/total/summary row is not a unit. Totals rows carry no unit id and
  // usually say "total"/"average"/"summary".
  function isSummaryRow(cells, map){
    var joined = cells.map(low).join(" ");
    if (/\btotal(s)?\b|\baverage(s)?\b|\bsummary\b|\bsubtotal\b|grand total/.test(joined)) return true;
    return false;
  }

  // Parse the grid into unit records + statistics. opts.commercialTypes: extra
  // regex/labels to treat as commercial (optional).
  function parse(grid, opts){
    opts = opts || {};
    var h = findHeader(grid);
    var out = { headerRow: h.headerRow, columns: h.map, units: [], residentialUnits: 0, commercialUnits: 0,
      gprAnnual: null, avgMarketRent: null, avgActualRent: null, occupancy: null,
      unitStats: [], commercialAnnual: null, warnings: [] };
    if (h.headerRow < 0) { out.warnings.push("No rent-roll header row found (need a unit/type column and a rent column)."); return out; }
    var map = h.map;
    var commRe = opts.commercialTypes ? new RegExp(opts.commercialTypes, "i") : COMMERCIAL_RE;

    for (var r = h.headerRow + 1; r < grid.length; r++){
      var row = grid[r]; if (!row) continue;
      var cells = row.map(function(x){ return x; });
      // skip fully blank rows
      if (!cells.some(function(x){ return str(x) !== ""; })) continue;
      if (isSummaryRow(cells, map)) continue;
      var unitId = map.unit != null ? str(row[map.unit]) : "";
      var typeRaw = map.type != null ? str(row[map.type]) : "";
      var sqft = map.sqft != null ? toNum(row[map.sqft]) : null;
      var market = map.market != null ? toNum(row[map.market]) : null;
      var actual = map.actual != null ? toNum(row[map.actual]) : null;
      var statusRaw = map.status != null ? low(row[map.status]) : "";
      // A row with neither a unit id nor any rent is not a unit line (e.g. a spacer/caption).
      if (!unitId && market == null && actual == null) continue;

      var commercial = commRe.test(low(typeRaw)) || (map.status != null && commRe.test(statusRaw));
      // Occupied: an explicit status wins; otherwise a positive actual rent means occupied,
      // a zero/blank actual rent means vacant (Azriel: vacant units read 0 in the actual column).
      var occupied;
      if (/vacan/.test(statusRaw)) occupied = false;
      else if (/occup|leased|current|filled/.test(statusRaw)) occupied = true;
      else occupied = (actual != null && actual > 0);

      var rec = { unit: unitId, type: typeRaw || "(unspecified)", sqft: sqft,
        marketRent: market, actualRent: actual, occupied: occupied, commercial: commercial };
      out.units.push(rec);

      if (market == null && actual == null) out.warnings.push("Unit " + (unitId || "(no id)") + " has no market or actual rent.");
      else if (market != null && actual != null && actual > market) out.warnings.push("Unit " + (unitId || "(no id)") + " actual rent (" + actual + ") is above its market rent (" + market + ").");
      if (!typeRaw && !commercial) out.warnings.push("Unit " + (unitId || "(no id)") + " has no unit type.");
    }

    // ---- residential aggregates (commercial excluded from every per-unit figure) ----
    var res = out.units.filter(function(u){ return !u.commercial; });
    var comm = out.units.filter(function(u){ return u.commercial; });
    out.residentialUnits = res.length;
    out.commercialUnits = comm.length;

    // GPR = grossed-up market rent for EVERY residential unit (vacant at market), ×12.
    var marketVals = res.map(function(u){ return u.marketRent; }).filter(function(v){ return v != null; });
    if (res.length && marketVals.length){ out.gprAnnual = round2(marketVals.reduce(function(a,b){ return a + b; }, 0) * 12); }

    // Average MARKET rent: over all residential units that have a market rent.
    out.avgMarketRent = marketVals.length ? round2(mean(marketVals)) : null;

    // Average ACTUAL rent: over OCCUPIED residential units only — exclude the vacant zeros.
    var occActual = res.filter(function(u){ return u.occupied && u.actualRent != null && u.actualRent > 0; }).map(function(u){ return u.actualRent; });
    out.avgActualRent = occActual.length ? round2(mean(occActual)) : null;

    // Occupancy = occupied residential units / residential units.
    if (res.length){ out.occupancy = round2(res.filter(function(u){ return u.occupied; }).length / res.length); }

    // Commercial income (annual): the commercial rows' actual rent (what's in place), ×12.
    var commActual = comm.map(function(u){ return u.actualRent; }).filter(function(v){ return v != null; });
    if (comm.length){ out.commercialAnnual = round2(commActual.reduce(function(a,b){ return a + b; }, 0) * 12); }

    // ---- Unit Statistics, by unit type (residential only) ----
    var byType = {};
    res.forEach(function(u){ var t = u.type || "(unspecified)"; (byType[t] = byType[t] || []).push(u); });
    out.unitStats = Object.keys(byType).map(function(t){
      var g = byType[t];
      var occ = g.filter(function(u){ return u.occupied; });
      var sqfts = g.map(function(u){ return u.sqft; }).filter(function(v){ return v != null; });
      var occSqfts = occ.map(function(u){ return u.sqft; }).filter(function(v){ return v != null; });
      var mkts = g.map(function(u){ return u.marketRent; }).filter(function(v){ return v != null; });
      var occRents = occ.map(function(u){ return u.actualRent; }).filter(function(v){ return v != null && v > 0; });
      return {
        type: t, count: g.length, occupied: occ.length,
        occPct: g.length ? round2(occ.length / g.length) : null,
        avgSqft: sqfts.length ? Math.round(mean(sqfts)) : null,
        occupiedSqft: occSqfts.length ? occSqfts.reduce(function(a,b){ return a + b; }, 0) : null,
        avgMarketRent: mkts.length ? round2(mean(mkts)) : null,
        avgOccupiedRent: occRents.length ? round2(mean(occRents)) : null
      };
    }).sort(function(a, b){ return b.count - a.count || String(a.type).localeCompare(String(b.type)); });

    return out;
  }

  return { parse: parse, findHeader: findHeader };
});
