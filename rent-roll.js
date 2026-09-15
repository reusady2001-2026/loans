/* ============================================================================
   Rent-roll parser — turns a multifamily rent-roll sheet (a 2-D grid of cells,
   e.g. SheetJS sheet_to_json({header:1})) into per-property unit records plus
   the unit statistics an underwriter reads off a rent roll.

   Built and validated against a real Yardi "Rent Roll" export (the Saint Louis
   group: Residences at Forest Park, Lofts at Lafayette Square, The Euclid, M
   Lofts, M Suites Commercial, York House — six properties stacked in ONE sheet).
   Its shape, and the rules Azriel (Living Residential) walked through on 9/10:

   • ONE row per unit: Unit, Unit Type, Unit Sq Ft, Resident, Name, Market Rent,
     Actual Rent, deposits, move-in / lease-expiration, balance. The column
     header spans TWO rows ("Market"/"Rent", "Actual"/"Rent", "Unit"/"Sq Ft") —
     they are merged before mapping.

   • Several PROPERTIES can share one sheet, each ending in a "Total <Property
     Name>" row. Units are grouped into the property whose Total row follows them.

   • Rows are grouped under status sections. "Current/Notice/Vacant" units are the
     property's real units; a "Future Residents/Applicants" section is the leasing
     PIPELINE (signed-but-not-moved-in) and is EXCLUDED from every count.

   • GROSS POTENTIAL RENT is the GROSSED-UP rent roll: the market rent of every
     residential unit — vacant units at their market/asking rent — annualized.

   • The average ACTUAL rent EXCLUDES vacant (zero-rent) units — "you have to
     exclude the zeros… you don't want the vacancies to weigh down the average."

   • VACANT is marked by the resident/name reading "VACANT". Commercial space
     (CAM / "Comm" unit types, restaurants and shops, or a property named
     "…Commercial") is kept for its income (the NOI) but excluded from the
     residential unit count, GPR and per-unit averages.

   • UNIT STATISTICS is by unit TYPE: count, % occupied, avg sqft, occupied sqft,
     avg market rent, avg occupied rent.

   • When the export prints its own "Summary Groups" footing (occupied / vacant /
     non-revenue unit counts and occupancy %), those printed figures are captured
     as the authoritative portfolio totals for reconciliation.

   Deterministic; never throws. Anomalies (no rent, no type, actual above market)
   are LISTED in a property's warnings, never dropped, never judged against a
   hard-coded threshold.
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
  function toNum(v){
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var s = v.replace(/[\s$€£]/g, ""); if (!s) return null;
    if (/^[-–—]+$/.test(s)) return 0;
    if (!/\d/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || s.indexOf("-") >= 0;
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function round2(n){ return Math.round(n * 100) / 100; }
  function sum(arr){ return arr.reduce(function(a,b){ return a + b; }, 0); }
  function mean(arr){ return arr.length ? sum(arr) / arr.length : null; }

  // Field detection over the MERGED header text of each column. First column to
  // match a field wins; a column is used for at most one field, and the rent
  // columns are claimed market-first so a leftover "Rent" reads as actual.
  var COLSPEC = [
    { key: "unit",   any: [/^unit\b/, /apt|apartment|door|space\b/] },
    { key: "type",   any: [/unit\s*type/, /floor\s*plan/, /\btype\b/, /\bplan\b/, /layout|style|model/, /bed(room)?s?\b/] },
    { key: "sqft",   any: [/sq\.?\s*ft|sq\.?\s*feet|square\s*f|\bsf\b|\bsqft\b|\barea\b|footage/] },
    { key: "resident", any: [/resident\b/, /\bt-?code\b/, /lessee/] },
    { key: "name",   any: [/^name$|tenant\s*name|resident\s*name|\bname\b/] },
    { key: "market", any: [/market\s*rent/, /gross\s*(potential\s*)?rent/, /asking\s*rent/, /\bgpr\b/, /\bmarket\b/] },
    { key: "actual", any: [/actual\s*rent/, /current\s*rent/, /in.?place\s*rent/, /lease(d)?\s*rent/, /charged\s*rent/, /tenant\s*rent/, /\bactual\b/, /^rent$/, /\brent\b/] },
    { key: "status", any: [/status/, /\boccup/, /vacan/] }
  ];
  var COMMERCIAL_TYPE_RE = /commercial|retail|\bcam\b|\bcomm\b|\bnnn\b|store\b|storefront|office\b/;
  var COMMERCIAL_NAME_RE = /commercial/i;
  var SECTION_CURRENT_RE = /current\s*\/\s*notice\s*\/\s*vacant/i;
  var SECTION_FUTURE_RE  = /future\s*residents?\s*\/\s*applicant/i;
  var TOTAL_RE = /^total\b/i;
  var VACANT_RE = /^vacant$/i;

  function scoreHeaderRow(cells){
    var used = {}, map = {}, score = 0;
    for (var s = 0; s < COLSPEC.length; s++){
      var spec = COLSPEC[s];
      for (var c = 0; c < cells.length; c++){
        if (used[c]) continue;
        var h = low(cells[c]); if (!h) continue;
        if (spec.any.some(function(re){ return re.test(h); })){ map[spec.key] = c; used[c] = 1; score++; break; }
      }
    }
    return { score: score, map: map };
  }

  // Combine two grid rows cell-by-cell into merged header text.
  function mergeCells(a, b){
    var n = Math.max((a || []).length, (b || []).length), out = [];
    for (var c = 0; c < n; c++){ out.push((str(a && a[c]) + " " + str(b && b[c])).trim()); }
    return out;
  }

  // Find the header row, allowing a two-row header. Returns { headerRow, dataStart, map, twoRow }.
  function findHeader(grid){
    if (!grid || !grid.length) return { headerRow: -1, dataStart: -1, map: {}, twoRow: false };
    var best = { score: 0, map: {}, row: -1 }, lim = Math.min(grid.length, 40);
    for (var r = 0; r < lim; r++){
      var res = scoreHeaderRow(grid[r] || []);
      var hasUnitish = res.map.unit != null || res.map.type != null;
      var hasRent = res.map.market != null || res.map.actual != null;
      if (res.score > best.score && hasUnitish && hasRent){ best = { score: res.score, map: res.map, row: r }; }
    }
    if (best.row < 0) return { headerRow: -1, dataStart: -1, map: {}, twoRow: false };
    // Two-row header: the next row is a sub-header when the rent columns there hold TEXT (e.g. "Rent"),
    // not numbers. Merge it and map on the combined text so "Market"/"Rent" → "Market Rent", etc.
    var next = grid[best.row + 1] || [];
    var mCol = best.map.market, aCol = best.map.actual;
    var rentCellNumeric = (mCol != null && toNum(next[mCol]) != null) || (aCol != null && toNum(next[aCol]) != null);
    var nextHasText = next.some(function(x){ return /[a-z]/i.test(str(x)); });
    if (!rentCellNumeric && nextHasText){
      var merged = mergeCells(grid[best.row], next);
      var res2 = scoreHeaderRow(merged);
      return { headerRow: best.row, dataStart: best.row + 2, map: res2.map, twoRow: true };
    }
    return { headerRow: best.row, dataStart: best.row + 1, map: best.map, twoRow: false };
  }

  // Aggregate one property's collected unit records into its statistics.
  function aggregate(name, units, opts){
    opts = opts || {};
    var out = { name: name || "(property)", units: units, residentialUnits: 0, commercialUnits: 0,
      vacantUnits: 0, gprAnnual: null, avgMarketRent: null, avgActualRent: null, occupancy: null,
      unitStats: [], commercialAnnual: null, warnings: [] };
    var propComm = COMMERCIAL_NAME_RE.test(name || "");
    units.forEach(function(u){
      u.commercial = u.commercial || propComm;   // a property named "…Commercial" is all commercial
      if (u.marketRent == null && u.actualRent == null) out.warnings.push("Unit " + (u.unit || "(no id)") + " has no market or actual rent.");
      else if (!u.commercial && u.marketRent != null && u.actualRent != null && u.actualRent > u.marketRent) out.warnings.push("Unit " + (u.unit || "(no id)") + " actual rent (" + u.actualRent + ") is above its market rent (" + u.marketRent + ").");
      if (!u.type && !u.commercial) out.warnings.push("Unit " + (u.unit || "(no id)") + " has no unit type.");
    });
    var res = units.filter(function(u){ return !u.commercial; });
    var comm = units.filter(function(u){ return u.commercial; });
    out.residentialUnits = res.length;
    out.commercialUnits = comm.length;
    out.vacantUnits = res.filter(function(u){ return !u.occupied; }).length;

    var marketVals = res.map(function(u){ return u.marketRent; }).filter(function(v){ return v != null; });
    if (res.length && marketVals.length) out.gprAnnual = round2(sum(marketVals) * 12);
    out.avgMarketRent = marketVals.length ? round2(mean(marketVals)) : null;
    var occActual = res.filter(function(u){ return u.occupied && u.actualRent != null && u.actualRent > 0; }).map(function(u){ return u.actualRent; });
    out.avgActualRent = occActual.length ? round2(mean(occActual)) : null;
    if (res.length) out.occupancy = round2(res.filter(function(u){ return u.occupied; }).length / res.length);
    var commActual = comm.map(function(u){ return u.actualRent; }).filter(function(v){ return v != null; });
    if (comm.length) out.commercialAnnual = round2(sum(commActual) * 12);

    var byType = {};
    res.forEach(function(u){ var t = u.type || "(unspecified)"; (byType[t] = byType[t] || []).push(u); });
    out.unitStats = Object.keys(byType).map(function(t){
      var g = byType[t], occ = g.filter(function(u){ return u.occupied; });
      var sqfts = g.map(function(u){ return u.sqft; }).filter(function(v){ return v != null; });
      var occSqfts = occ.map(function(u){ return u.sqft; }).filter(function(v){ return v != null; });
      var mkts = g.map(function(u){ return u.marketRent; }).filter(function(v){ return v != null; });
      var occRents = occ.map(function(u){ return u.actualRent; }).filter(function(v){ return v != null && v > 0; });
      return { type: t, count: g.length, occupied: occ.length,
        occPct: g.length ? round2(occ.length / g.length) : null,
        avgSqft: sqfts.length ? Math.round(mean(sqfts)) : null,
        occupiedSqft: occSqfts.length ? sum(occSqfts) : null,
        avgMarketRent: mkts.length ? round2(mean(mkts)) : null,
        avgOccupiedRent: occRents.length ? round2(mean(occRents)) : null };
    }).sort(function(a, b){ return b.count - a.count || String(a.type).localeCompare(String(b.type)); });
    return out;
  }

  // One unit row → a record (or null when the row is not a unit).
  function unitRecord(row, map, opts){
    opts = opts || {};
    var unitId = map.unit != null ? str(row[map.unit]) : "";
    var typeRaw = map.type != null ? str(row[map.type]) : "";
    var resident = map.resident != null ? str(row[map.resident]) : "";
    var nameRaw = map.name != null ? str(row[map.name]) : "";
    var sqft = map.sqft != null ? toNum(row[map.sqft]) : null;
    var market = map.market != null ? toNum(row[map.market]) : null;
    var actual = map.actual != null ? toNum(row[map.actual]) : null;
    var statusRaw = map.status != null ? low(row[map.status]) : "";
    if (!unitId && market == null && actual == null) return null;
    var commercial = COMMERCIAL_TYPE_RE.test(low(typeRaw)) || COMMERCIAL_TYPE_RE.test(low(unitId));
    var vacant = VACANT_RE.test(resident) || VACANT_RE.test(nameRaw) || /vacan/.test(statusRaw);
    var occupied;
    if (vacant) occupied = false;
    else if (/occup|leased|current|filled/.test(statusRaw)) occupied = true;
    else occupied = (actual != null && actual > 0);
    return { unit: unitId, type: typeRaw, sqft: sqft, resident: resident, name: nameRaw,
      marketRent: market, actualRent: actual, occupied: occupied, commercial: commercial };
  }

  // The printed "Summary Groups" footing, when present: occupied / vacant / non-revenue unit counts and
  // occupancy — the authoritative portfolio totals. Read from the block starting at a "Summary Groups" row.
  function readSummary(grid, fromRow){
    var s = { occupiedUnits: null, vacantUnits: null, nonRevUnits: null, totalUnits: null, occupancyPct: null, sqftOccupiedPct: null };
    // find the header of the summary block to locate the "# Of Units" / "% Unit Occupancy" columns
    var unitsCol = null, occCol = null;
    for (var r = fromRow; r < Math.min(grid.length, fromRow + 4); r++){
      var merged = mergeCells(grid[r], grid[r + 1] || []);
      for (var c = 0; c < merged.length; c++){
        var h = low(merged[c]);
        if (unitsCol == null && /#\s*of\s*units|number\s*of\s*units|^units$|of\s*units/.test(h)) unitsCol = c;
        if (occCol == null && /%\s*unit\s*occup|unit\s*occupancy|occupancy/.test(h)) occCol = c;
      }
      if (unitsCol != null) break;
    }
    for (var r2 = fromRow; r2 < grid.length; r2++){
      var label = low(grid[r2] && grid[r2][0]);
      if (!label) continue;
      var uv = unitsCol != null ? toNum(grid[r2][unitsCol]) : null;
      var ov = occCol != null ? toNum(grid[r2][occCol]) : null;
      if (/occupied\s*units/.test(label)) { s.occupiedUnits = uv; if (ov != null) s.occupancyPct = ov; }
      else if (/non\s*rev/.test(label)) s.nonRevUnits = uv;
      else if (/vacant\s*units/.test(label)) s.vacantUnits = uv;
      else if (/^totals?:/.test(label) || /^totals?\b/.test(label)) { if (uv != null) s.totalUnits = uv; }
    }
    return s;
  }

  // Parse the whole sheet → { headerRow, columns, properties:[…], summary, warnings }.
  function parse(grid, opts){
    opts = opts || {};
    var out = { headerRow: -1, columns: {}, properties: [], summary: null, warnings: [] };
    var h = findHeader(grid);
    out.headerRow = h.headerRow; out.columns = h.map;
    if (h.headerRow < 0){ out.warnings.push("No rent-roll header row found (need a unit/type column and a rent column)."); return out; }
    var map = h.map, pending = [], section = "current", sawSummary = false;

    for (var r = h.dataStart; r < grid.length; r++){
      var row = grid[r]; if (!row) continue;
      if (!row.some(function(x){ return str(x) !== ""; })) continue;   // blank
      var c0 = str(row[0]);
      var joined = row.map(low).join(" ");
      // Summary Groups footing — stop unit parsing, capture the printed totals.
      if (/summary\s*groups/.test(joined)){ out.summary = readSummary(grid, r); sawSummary = true; break; }
      // status sections
      if (SECTION_FUTURE_RE.test(joined)){ section = "future"; continue; }
      if (SECTION_CURRENT_RE.test(joined)){ section = "current"; continue; }
      // a "Total <name>" row closes a property (or the grand "All Properties" total)
      var isTotal = TOTAL_RE.test(c0) || (map.resident != null && TOTAL_RE.test(str(row[map.resident]))) || row.some(function(x){ return TOTAL_RE.test(str(x)); });
      if (isTotal){
        // the property name sits in the Name/Resident column of the Total row
        var nm = map.name != null ? str(row[map.name]) : "";
        if (!nm && map.resident != null) nm = str(row[map.resident]);
        if (/all\s*properties/i.test(nm)){ pending = []; section = "current"; continue; }   // grand total, not a property
        if (pending.length){ out.properties.push(aggregate(nm.replace(/\(.*$/, "").trim(), pending, opts)); }
        pending = []; section = "current"; continue;
      }
      if (section === "future") continue;   // leasing pipeline — excluded
      var rec = unitRecord(row, map, opts);
      if (rec) pending.push(rec);
    }
    // units with no closing Total row → one property (single-property sheet)
    if (pending.length) out.properties.push(aggregate(opts.propertyName || "(property)", pending, opts));
    return out;
  }

  return { parse: parse, findHeader: findHeader, aggregate: aggregate };
});
