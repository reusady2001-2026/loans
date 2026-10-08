// 2.9.14 — the pooled-loan fixture (all made up): 5 properties, one control property, the pool's terms, and the "before"
// book for the 5-into-1 refinance (each property on its own loan; Cedar Point with a senior + a mezz).
const PROPS = [
  { name: 'Maple Court',            addr: '101 Maple Ave, Columbus, OH 43215', noi: 1000000, ala: 12000000 },
  { name: 'Birch Gardens',          addr: '202 Birch St, Dayton, OH 45402',    noi: 1200000, ala: 10000000 },
  { name: 'Cedar Point Apartments', addr: '303 Cedar Rd, Akron, OH 44308',     noi:  800000, ala:  9000000 },
  { name: 'Dogwood Flats',          addr: '404 Dogwood Ln, Toledo, OH 43604',  noi: 1500000, ala: 13000000 },
  { name: 'Elm Terrace',            addr: '505 Elm Blvd, Canton, OH 44702',    noi:  500000, ala:  6000000 },
];
const CONTROL = { name: 'Control Tower', addr: '900 Control Way, Cincinnati, OH 45202', noi: 900000 };
const BASE = {
  propertyType: 'Multifamily', loanStatus: '', fixedAmortAmount: null, ioMonths: 0, index: '', armAssumedIndex: null, spread: null,
  rateFloor: null, rateCap: null, liborUntil: '', liborSpread: null, armInitialFixedMonths: null, armAdjustFreqMonths: null,
  escrowTax: null, escrowInsurance: null, replacementReserve: null, tilcReserve: null, groundLease: null, otherEscrow1Desc: '', otherEscrow1Amt: null,
  otherEscrow2Desc: '', otherEscrow2Amt: null, servicingFee: null, trusteeFee: null, otherFee1Desc: '', otherFee1Amt: null, otherFee2Desc: '', otherFee2Amt: null,
  isHistorical: true, amortMethod: '30/360', amortType: 'Level', lienPosition: 'Senior', prepayType: 'Open', prepayConfirmed: true,
};
const POOL_TERMS = Object.assign({}, BASE, { lenderName: 'Pool Bank', loanNumber: 'POOL-1', originalAmount: 50000000, annualRate: 0.055, rateType: 'Fixed',
  originationDate: '2024-01-01', firstPaymentDate: '2024-02-01', maturityDate: '2034-01-01', loanTermMonths: 120, amortizationMonths: 360 });
function loan(id, over) { return Object.assign({}, BASE, { _id: id }, over); }
const CONTROL_LOAN = loan('ln_control', { propertyName: CONTROL.name, propertyAddress: CONTROL.addr, lenderName: 'Control Bank', loanNumber: 'CTRL-1',
  originalAmount: 10000000, annualRate: 0.05, rateType: 'Fixed', originationDate: '2023-06-01', firstPaymentDate: '2023-07-01', maturityDate: '2033-06-01', loanTermMonths: 120, amortizationMonths: 360 });
// "Before" book for the refinance test: six loans on the five properties.
function bookR() {
  const t = new Date(), iso = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 10); };
  const my = t.getUTCFullYear(), mm = t.getUTCMonth() + 8;   // every old loan matures 8 months from today (within the 12-month window)
  const L = (id, p, amt, rate, extra) => loan(id, Object.assign({ propertyName: p.name, propertyAddress: p.addr, lenderName: 'Old Lender ' + id.slice(-1), loanNumber: 'OLD-' + id.slice(-1),
    originalAmount: amt, annualRate: rate, rateType: 'Fixed', originationDate: iso(my - 10, mm), firstPaymentDate: iso(my - 10, mm + 1), maturityDate: iso(my, mm), loanTermMonths: 120, amortizationMonths: 360 }, extra || {}));   // all mature within 12 months: the app's own rule says refinance
  return [CONTROL_LOAN,
    L('ln_r1', PROPS[0], 9000000, 0.045), L('ln_r2', PROPS[1], 11000000, 0.0475), L('ln_r3', PROPS[2], 7000000, 0.0425),
    L('ln_r4', Object.assign({}, PROPS[2], { name: 'Cedar Point Apartments (Mezz)' }), 1500000, 0.09, { lienPosition: 'Mezzanine', lenderName: 'Mezz Fund', loanNumber: 'OLD-M' }),
    L('ln_r5', PROPS[3], 14000000, 0.05), L('ln_r6', PROPS[4], 4000000, 0.049)];
}
// N properties for the scale test (12 by default): same shape, NOI 400k each, ALA 4M each.
function bigProps(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ name: 'Scale Property ' + String(i).padStart(2, '0'), addr: (1000 + i) + ' Scale St, Columbus, OH 43215', noi: 400000, ala: 4000000 }); return a; }
const BIG_TERMS = Object.assign({}, POOL_TERMS, { loanNumber: 'POOL-BIG', originalAmount: 48000000, lenderName: 'Scale Bank' });
module.exports = { PROPS, CONTROL, CONTROL_LOAN, POOL_TERMS, BASE, loan, bookR, bigProps, BIG_TERMS };
