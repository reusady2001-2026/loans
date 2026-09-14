/* ============================================================================
   Property Profile (2.9.1) - the per-PROPERTY record of the static facts a
   property has that its loans and T12 do not: residential/commercial units,
   rentable square footage, year built, acquisition date, who manages it, the
   Yardi code, a manual status, and free-text notes. It lives beside the T12 and
   general-data.json in the property's folder (profile.json).

   Every field carries its PROVENANCE: { value, source, changedBy, changedAt }
   plus a short history of prior values (each with the reason it changed). source
   is { kind: "manual" | "agreement" | "unitStatistics" | ... , file, page, quote }
   so an AI-extracted figure (704 units from page 3 of the agreement) always
   shows where it came from, and a later change keeps the trail.

   A profile can exist for a property with NO loan and NO T12 (a name-only
   "Add Property"), so it is stored on its own, never rebuilt from the T12.

   Pure and dependency-free: no I/O, no clock except the ISO string the caller
   passes in. Unit-testable on its own.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Profile = api;
  if (typeof globalThis !== "undefined") globalThis.Profile = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA = "lds.profile.v1";

  // The Profile tab's fields, in display order and grouped into sections. `type`
  // drives the input and the formatting; `options` is for a select (the first,
  // empty option means "not set"); `unit` is a suffix; `help` is the hint under
  // the field. A field with no stored value is EMPTY (shown blank) - never 0.
  var FIELDS = [
    { key: "propertyName",    label: "Property name",       type: "text",     group: "Identity" },
    { key: "address",         label: "Address / market",    type: "text",     group: "Identity" },
    { key: "residentialUnits", label: "Residential units",  type: "int",      group: "Size", unit: "units" },
    { key: "commercialUnits",  label: "Commercial units",   type: "int",      group: "Size", unit: "units",
      help: "Ground-floor retail or restaurants - counted in NOI, kept out of the per-unit and average-rent figures." },
    { key: "rentableSqFt",    label: "Rentable sq ft",      type: "int",      group: "Size", unit: "sq ft" },
    { key: "yearBuilt",       label: "Year built",          type: "int",      group: "Size" },
    { key: "acquisitionDate", label: "Acquisition date",    type: "date",     group: "Ownership",
      help: "When Living acquired it. If it falls inside a T12's months, it also triggers the last-3-months annualization." },
    { key: "manager",         label: "Manager",             type: "text",     group: "Ownership",
      help: "Living, or the third-party manager's name." },
    { key: "dataSource",      label: "Data source",         type: "select",   group: "Ownership",
      options: ["", "Living Yardi", "Third-party", "Manual"] },
    { key: "yardiCode",       label: "Yardi property code", type: "text",     group: "Ownership" },
    { key: "notes",           label: "Notes",               type: "textarea", group: "Notes" }
  ];

  // A property's profile is "complete" when these are filled.
  var COMPLETENESS = ["propertyName", "residentialUnits", "acquisitionDate", "manager"];

  var FIELD_BY_KEY = {}; FIELDS.forEach(function (f) { FIELD_BY_KEY[f.key] = f; });

  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }
  function nowISO(opts) { return (opts && opts.changedAt) || new Date().toISOString(); }
  function isEmptyVal(v) { return v == null || v === "" || (typeof v === "number" && !isFinite(v)); }

  function emptyProfile(propKey) {
    return { schema: SCHEMA, propKey: propKey != null ? propKey : null, fields: {}, archived: false, createdAt: null, updatedAt: null };
  }

  // Accept a stored object (or null) and return a well-formed profile without mutating the input.
  function coerce(profile, propKey) {
    var p = isObj(profile) ? profile : {};
    return {
      schema: SCHEMA,
      propKey: (p.propKey != null ? p.propKey : (propKey != null ? propKey : null)),
      fields: isObj(p.fields) ? p.fields : {},
      archived: !!p.archived,
      createdAt: p.createdAt || null,
      updatedAt: p.updatedAt || null
    };
  }

  function getField(profile, key) { return (profile && isObj(profile.fields) && profile.fields[key]) || null; }
  function getValue(profile, key) { var f = getField(profile, key); return f ? f.value : undefined; }
  // The value only when it is actually set (not null/""); else undefined. Callers use this to fall
  // back to a loan-derived default without treating a blank profile field as 0.
  function value(profile, key) { var v = getValue(profile, key); return isEmptyVal(v) ? undefined : v; }

  // Set a field with provenance. The prior state (if the value actually changed, or a reason is
  // given) is pushed onto the field's history, newest first, capped. Returns the SAME profile.
  function setField(profile, key, val, opts) {
    opts = opts || {};
    if (!isObj(profile.fields)) profile.fields = {};
    var prev = profile.fields[key] || null;
    var at = nowISO(opts);
    var entry = {
      value: val,
      source: isObj(opts.source) ? opts.source : { kind: "manual" },
      changedBy: opts.changedBy || null,
      changedAt: at,
      history: (prev && Array.isArray(prev.history)) ? prev.history.slice() : []
    };
    var valueChanged = !prev || prev.value !== val;
    if (prev && (valueChanged || opts.reason)) {
      entry.history.unshift({
        value: prev.value, source: prev.source || null,
        changedBy: prev.changedBy || null, changedAt: prev.changedAt || null,
        reason: opts.reason || null
      });
      if (entry.history.length > 20) entry.history = entry.history.slice(0, 20);
    }
    profile.fields[key] = entry;
    if (!profile.createdAt) profile.createdAt = at;
    profile.updatedAt = at;
    return profile;
  }

  // { complete: bool, missing: [key,...], filled: n, total: n } over the COMPLETENESS keys.
  function completeness(profile) {
    var missing = [];
    COMPLETENESS.forEach(function (k) { if (isEmptyVal(getValue(profile, k))) missing.push(k); });
    return { complete: missing.length === 0, missing: missing, filled: COMPLETENESS.length - missing.length, total: COMPLETENESS.length };
  }

  // Normalize a value for equality: numbers compared numerically, strings case/space-folded, dates by
  // their yyyy-mm-dd day. Used by the mismatch check so "704" and 704, or "  A " and "a", agree.
  function norm(v) {
    if (isEmptyVal(v)) return null;
    if (typeof v === "number") return v;
    var s = String(v).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    var d = s.match(/^(\d{4}-\d{2}-\d{2})/); if (d) return d[1];
    return s.toLowerCase().replace(/\s+/g, " ");
  }
  // True when a confirmed/stored value and a freshly extracted value both exist and disagree.
  function isMismatch(existingValue, extractedValue) {
    var a = norm(existingValue), b = norm(extractedValue);
    if (a == null || b == null) return false;
    return a !== b;
  }

  function fieldDef(key) { return FIELD_BY_KEY[key] || null; }
  function labelFor(key) { var f = FIELD_BY_KEY[key]; return f ? f.label : key; }

  return {
    SCHEMA: SCHEMA, FIELDS: FIELDS, COMPLETENESS: COMPLETENESS,
    emptyProfile: emptyProfile, coerce: coerce,
    getField: getField, getValue: getValue, value: value, setField: setField,
    completeness: completeness, isMismatch: isMismatch, norm: norm,
    fieldDef: fieldDef, labelFor: labelFor, isEmptyVal: isEmptyVal
  };
});
