/* 2.9.9 (fixes 1, 2) — file parts and property names.
   A workbook's parts (its sheets, or the properties' sections on a rent-roll sheet), numbered as the operator sees
   them in Excel; the answer a property keeps (sheet number + name, section number + name) and the part it points
   at — never a different tab that happens to have the number; a new month's export pre-filled from last time; and
   the Yardi code that ties "12 Month Statement-15169" to "The Euclid(15169)".
   Run: node test/file-parts.test.js */
const path = require("path");
let fails = 0, count = 0;
const ok = (c, m) => { count++; console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };
const XLSX = require(path.join(__dirname, "..", "vendor", "xlsx.full.min.js"));
const FP = require(path.join(__dirname, "..", "file-parts.js"));
const PN = require(path.join(__dirname, "..", "prop-names.js"));
const T12Parse = require(path.join(__dirname, "..", "t12-parse.js"));
const RentRoll = require(path.join(__dirname, "..", "rent-roll.js"));
const M = ["Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025","Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026","Jul 2026"];
const rowOf = (l, v) => [l, ...Array(12).fill(v), v * 12];
const t12 = (top, rent, tax) => XLSX.utils.aoa_to_sheet([[top], ["12 Month Statement"], ["Account", ...M, "Total"], ["INCOME"], rowOf("Gross Potential Rent", rent), rowOf("TOTAL INCOME", rent), ["EXPENSES"], rowOf("Real Estate Taxes", tax), rowOf("TOTAL EXPENSES", tax), rowOf("NET OPERATING INCOME", rent - tax)]);
const topName = (g) => { const h = T12Parse.findHeader(g); for (let r = 0; r < h.headerRow; r++){ const s = String((g[r] || [])[0] || "").trim(); if (s && !/statement/i.test(s)) return s; } return ""; };
const deps = { XLSX, T12Parse, RentRoll, topName };

// ---- a T12 workbook: 3 property sheets and an empty one ----
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, t12("Residences at Forest Park Hotel", 200000, 65000), "12 Month Statement-15155");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Blank");
XLSX.utils.book_append_sheet(wb, t12("The Euclid", 250000, 99583), "12 Month Statement-15169");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Report run by Yardi"], ["Parameters: all"]]), "Parameters");
const info = FP.analyzeWorkbook(XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })), deps);
ok(info.sheetsCount === 4 && info.parts.length === 3 && info.multi, "4 sheets, 3 parts (the empty sheet is not a part)");
ok(info.parts.map((p) => p.sheetNo).join() === "1,3,4", "each part keeps its sheet's number in the workbook — 1, 3, 4 (the order you see in Excel)");
ok(info.parts[0].kind === "t12" && info.parts[1].kind === "t12" && info.parts[2].kind === "sheet", "two T12 sheets and a plain sheet");
ok(info.parts[1].title === "The Euclid" && /NOI \$1,805,004/.test(info.parts[1].info), "a T12 part carries the name above it and its NOI (" + info.parts[1].info + ")");
ok(FP.partLabel(info.parts[1], info.sheetsCount) === "Sheet 3 of 4 · 12 Month Statement-15169 · The Euclid", "label: " + FP.partLabel(info.parts[1], info.sheetsCount));

// ---- a rent roll: three properties' sections on one sheet ----
const rr = ["Rent Roll", "Unit,Unit Type,Unit,Resident,Name,Market,Actual", ",,Sq Ft,,,Rent,Rent", "Current/Notice/Vacant Residents",
  "101,A1,800,t1,A,1500,1500", ",,,Total,Villages of Whitewater(15200),1500,1500",
  "201,A1,800,t2,B,1500,1500", "202,A1,800,VACANT,VACANT,1500,0", ",,,Total,The Euclid(15169),3000,1500",
  "301,A1,800,t3,C,1500,1500", ",,,Total,Villages of Independence(15300),1500,1500"].join("\n");
const rinfo = FP.analyzeWorkbook(XLSX.read(rr, { type: "string" }), deps);
ok(rinfo.parts.length === 3 && rinfo.parts.every((p) => p.kind === "rentroll" && p.sheetNo === 1), "a rent roll with 3 properties on one sheet is 3 parts on sheet 1");
ok(rinfo.parts[1].sectionNo === 2 && rinfo.parts[1].section === "The Euclid(15169)" && rinfo.parts[1].title === "The Euclid", "section 2 keeps its full label with the code: “The Euclid(15169)”");
ok(/^Section 2 of 3 on sheet 1 “.*” · The Euclid\(15169\)$/.test(FP.partLabel(rinfo.parts[1], rinfo.sheetsCount)) && /2 units, 1 occupied/.test(rinfo.parts[1].info), "label: " + FP.partLabel(rinfo.parts[1], rinfo.sheetsCount));

// ---- the answer a property keeps, and the part it points at ----
const rec = FP.makeRecord("Scheduler_Reports.xlsx", "abc", info, info.parts[1], "You", "2026-10-06T00:00:00Z");
ok(rec.sheetNo === 3 && rec.sheet === "12 Month Statement-15169" && rec.sheets === 4 && rec.parts === 3 && rec.kind === "t12", "the record: sheet number 3 of 4, its name, its kind");
ok(FP.partForRecord(info, rec) === info.parts[1], "it points at sheet 3");
ok(FP.partForRecord(info, Object.assign({}, rec, { sheet: "Some other tab" })) === null, "a sheet 3 with a different name is NOT taken — never another tab that has the number");
const none = FP.makeRecord("Scheduler_Reports.xlsx", "abc", info, null, "You");
ok(none.none === true && FP.partForRecord(info, none) === null, "“none of its parts is this property’s” is a record too");
let list = FP.upsertRecord([], rec); list = FP.upsertRecord(list, Object.assign({}, rec, { sheetNo: 1, sheet: "12 Month Statement-15155" }));
ok(list.length === 1 && list[0].sheetNo === 1, "one answer per file: a new answer for the same file replaces the old one");
ok(FP.findRecord(list, "abc") === list[0] && FP.findRecord(list, "zzz") === null, "found by the file's checksum");
const rrRec = FP.makeRecord("RentRoll.csv", "rr1", rinfo, rinfo.parts[1], "You");
ok(rrRec.sectionNo === 2 && rrRec.section === "The Euclid(15169)" && FP.partForRecord(rinfo, rrRec) === rinfo.parts[1], "a rent-roll answer: section 2, “The Euclid(15169)”");

// ---- a new month's export arrives pre-filled from last time ----
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, t12("The Euclid", 251000, 99583), "12 Month Statement-15169");        // the tabs moved
XLSX.utils.book_append_sheet(wb2, t12("Residences at Forest Park Hotel", 201000, 65000), "12 Month Statement-15155");
const info2 = FP.analyzeWorkbook(XLSX.read(XLSX.write(wb2, { type: "buffer", bookType: "xlsx" })), deps);
const sug = FP.suggestFromRecords(info2, { "name:queens gate apartments": [rec] }, "Scheduler_Reports.xlsx", "new-sha");
ok(sug[1] === "name:queens gate apartments" && sug[2] == null, "next month’s file (same tab name, now sheet 1) is pre-filled for the property that had it — by the tab's name, not its old number");
const sug2 = FP.suggestFromRecords(rinfo, { "name:queens gate apartments": [rrRec] }, "RentRoll Oct.csv", "x");
ok(sug2[2] === "name:queens gate apartments" && sug2[1] == null && sug2[3] == null, "a new rent roll: the section with the same label is pre-filled");

// ---- names and Yardi codes ----
ok(PN.codesIn("The Euclid(15169)").join() === "15169" && PN.codesIn("12 Month Statement-15169").join() === "15169" && PN.codesIn("T12 2026").length === 0, "the code at the end of a name (a year is not a code)");
ok(PN.baseName("The Euclid(15169)") === "The Euclid", "the name without its code");
ok(PN.matchScore("The Euclid(15169)", ["40 N Euclid Ave"], ["15169"]) === 1, "the same code ties “The Euclid(15169)” to a property known by 15169");
ok(PN.matchScore("The Euclid(15169)", ["40 N Euclid Ave"], []) < 0.6, "…without the code, “The Euclid” is NOT “40 N Euclid Ave” (one shared word) — the card asks instead");
ok(PN.matchScore("Villages of Whitewater(15200)", ["Villages of Whitewater"], []) === 1, "the property's own name matches with or without the code");

console.log(fails ? fails + " of " + count + " FAILED" : "all " + count + " file-parts checks passed");
process.exit(fails ? 1 : 0);
