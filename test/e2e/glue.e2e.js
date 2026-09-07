/* Glue e2e — the operating model's life-cycle across the app's own loan edits (index.html glue, not a module):
     • an address edit on a property's ONLY loan carries its saved model to the new key and says so;
     • an edit that lands on a property with other loans, or that would collide with a saved model, leaves the
       model where the rule says and says so (nothing merged, nothing destroyed);
     • a model on the wrong property can be moved on by hand (Underwriting → "Move it to"), and deleted;
     • removing a property's last loan strands its model visibly (records no loan uses → Move / Delete).
   Run: GN=/opt/node22/lib/node_modules xvfb-run -a /opt/node22/bin/node test/e2e/glue.e2e.js */
const H = require('./_helpers');
const fails = { n: 0 }, ok = H.ok(fails);
const K_VW1 = 'addr:10400 edgewood rd, harrison, oh 45030';         // Villages of Whitewater (one loan)
const K_VW2 = 'addr:196 maxwell ln, harrison, oh 45030';            // Villages of Whitewater II (one loan)
const K_VW2B = 'addr:196 maxwell lane, harrison, oh 45030';         // …after an address edit
const K_AV = 'addr:white plains, ny';                               // Avalon White Plains (senior + mezz, no model)

(async () => {
  const { app, page, errors } = await H.launchApp();
  const records = () => page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return (s && s.records) || {}; } catch (e) { return {}; } });
  const loanCount = () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('ldsHub.loans.v7') || '[]') || []).length; } catch (e) { return -1; } });
  const toast = () => page.evaluate(() => (document.getElementById('toastText') || {}).textContent || '');
  const waitRec = (fn, msg) => page.waitForFunction(fn, null, { timeout: 8000 }).catch(() => ok(false, 'timeout waiting: ' + msg));
  const gpr = (r) => r && r.lines && r.lines.GPR ? r.lines.GPR.annual : null;
  // Open a loan by name (the portfolio rows / loan select), switch to edit, set the address, save.
  async function editAddress(name, address) {
    const found = await page.evaluate((n) => {
      const sel = document.getElementById('loanSelect');
      const o = sel && [...sel.options].find(x => (x.textContent || '').indexOf(n) >= 0 && (x.textContent || '').indexOf(n + ' ') < 0 || (x.textContent || '').trim().startsWith(n + '  ') || (x.textContent || '').trim() === n);
      if (!o) return null; sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return o.value; }, name);
    if (!found) { ok(false, 'loan "' + name + '" not in #loanSelect'); return; }
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('editBtn').click());
    await page.waitForSelector('#f_propertyAddress', { state: 'attached', timeout: 5000 });
    await page.evaluate((a) => { const i = document.getElementById('f_propertyAddress'); i.value = a;
      i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('saveBtn').click(); }, address);
    await page.waitForTimeout(250);
  }
  async function removeLoan(name) {
    const found = await page.evaluate((n) => { const sel = document.getElementById('loanSelect');
      const o = sel && [...sel.options].find(x => (x.textContent || '').trim().startsWith(n) && !(x.textContent || '').trim().startsWith(n + ' II'));
      if (!o) return null; sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return o.value; }, name);
    if (!found) { ok(false, 'loan "' + name + '" not in #loanSelect'); return; }
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('removeBtn').click());
    await page.waitForSelector('#confirmModal:not(.hidden)', { state: 'attached', timeout: 5000 });
    await page.evaluate(() => document.getElementById('confirmOk').click());
    await page.waitForTimeout(250);
  }
  async function typeGPR(amount) {
    const sel = '#opSheetMount tr[data-op-code="GPR"] [data-op-input]';
    await page.waitForSelector(sel, { state: 'attached', timeout: 5000 });
    await page.click(sel); await page.fill(sel, String(amount)); await page.press(sel, 'Enter');
    await page.waitForTimeout(300);
  }

  // ---- 1. a saved model on Villages of Whitewater II ----------------------------------------------------
  await H.openUnderwriting(page);
  const k2 = await H.pickProperty(page, 'Villages of Whitewater II');
  ok(k2 === K_VW2, 'picked Villages of Whitewater II → ' + k2);
  ok(await page.evaluate(() => document.getElementById('opOrphans').hidden), 'no "records no loan uses" box on a fresh store');
  ok(await page.evaluate(() => document.getElementById('opManage').hidden), 'no manage row before a model is saved');
  await typeGPR(12000);
  await waitRec(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return !!(s.records && s.records['addr:196 maxwell ln, harrison, oh 45030']); } catch (e) { return false; } }, 'record saved');
  let r = await records();
  ok(gpr(r[K_VW2]) === 12000, 'GPR 12,000 saved under ' + K_VW2 + ' (got ' + gpr(r[K_VW2]) + ')');
  ok(await page.evaluate(() => !document.getElementById('opManage').hidden && !!document.querySelector('[data-op-manage]')), 'manage row appears once the property has a saved model');
  const nTargets = await page.evaluate(() => document.getElementById('opMoveTarget').options.length - 1);
  ok(nTargets === 27, 'move targets = the 27 other properties, none of which has a model (got ' + nTargets + ')');
  ok(await page.evaluate(() => document.getElementById('opMoveBtn').disabled), 'Move is disabled until a target is picked');

  // ---- 2. address edit on the property's only loan → the model follows, and the toast says so ------------
  await editAddress('Villages of Whitewater II', '196 Maxwell Lane, Harrison, OH 45030');
  r = await records();
  ok(gpr(r[K_VW2B]) === 12000 && !r[K_VW2], 'sole-loan address edit: model now under ' + K_VW2B + ', nothing left under the old key');
  let t = await toast();
  ok(/Loan updated · its operating model moved with it to “Villages of Whitewater II”/.test(t), 'toast says the model moved (got "' + t + '")');
  await editAddress('Villages of Whitewater II', '196 Maxwell Ln, Harrison, OH 45030');
  r = await records();
  ok(gpr(r[K_VW2]) === 12000 && !r[K_VW2B], 'edited back: model back under ' + K_VW2);

  // ---- 3. edit onto a property that has loans but no model → follows; edit back → stays (others remain) ---
  await editAddress('Villages of Whitewater II', 'White Plains, NY');
  r = await records();
  ok(gpr(r[K_AV]) === 12000 && !r[K_VW2], 'joining Avalon (2 loans, no model): the model follows the loan to ' + K_AV);
  t = await toast();
  ok(/moved with it to “Avalon White Plains”/.test(t), 'toast names Avalon (got "' + t + '")');
  await editAddress('Villages of Whitewater II', '196 Maxwell Ln, Harrison, OH 45030');
  r = await records();
  ok(gpr(r[K_AV]) === 12000 && !r[K_VW2], 'leaving Avalon: its two loans keep the model, Villages II has none');
  t = await toast();
  ok(/Loan updated · its operating model stays with the loan\(s\) still at “Avalon White Plains”/.test(t), 'toast says the model stayed with Avalon (got "' + t + '")');

  // ---- 4. hand move from Avalon back to Villages II (the undo path) --------------------------------------
  await H.openUnderwriting(page);
  const kav = await H.pickProperty(page, 'Avalon White Plains');
  ok(kav === K_AV, 'picked Avalon → ' + kav);
  ok(await page.evaluate(() => !document.getElementById('opManage').hidden), 'Avalon shows the manage row (it holds the model)');
  const hasTarget = await page.evaluate((k) => { const s = document.getElementById('opMoveTarget'); const o = [...s.options].find(x => x.value === k); if (!o) return false; s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }, K_VW2);
  ok(hasTarget, 'Villages II is offered as a move target');
  ok(await page.evaluate(() => !document.getElementById('opMoveBtn').disabled), 'Move enabled after picking a target');
  await page.evaluate(() => document.getElementById('opMoveBtn').click());
  await waitRec(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return !!(s.records && s.records['addr:196 maxwell ln, harrison, oh 45030'] && !s.records['addr:white plains, ny']); } catch (e) { return false; } }, 'hand move');
  r = await records();
  ok(gpr(r[K_VW2]) === 12000 && !r[K_AV], 'hand move: model back under Villages II, Avalon has none');
  ok(r[K_VW2].propertyName === 'Villages of Whitewater II', 'moved record renamed to its new property (got "' + r[K_VW2].propertyName + '")');
  t = await toast();
  ok(/Operating model moved onto “Villages of Whitewater II”/.test(t), 'toast confirms the hand move (got "' + t + '")');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.getElementById('opPropPick').value)) === K_VW2, 'focus followed the model to Villages II');

  // ---- 5. removing the property's last loan strands the model visibly -------------------------------------
  const before = await loanCount();
  await removeLoan('Villages of Whitewater II');
  ok((await loanCount()) === before - 1, 'loan removed (' + before + ' → ' + (before - 1) + ')');
  t = await toast();
  ok(/Loan removed · its operating model \(“Villages of Whitewater II”\) is kept — move or delete it under Underwriting/.test(t), 'toast says the model is kept (got "' + t + '")');
  r = await records();
  ok(gpr(r[K_VW2]) === 12000, 'the record survives the loan');
  await H.openUnderwriting(page);
  ok(!(await page.evaluate(() => [...document.getElementById('opPropPick').options].some(o => o.value === 'addr:196 maxwell ln, harrison, oh 45030'))), 'Villages II is no longer in the picker');
  await H.pickProperty(page, 'Villages of Whitewater');     // the remaining one, no model
  ok((await page.evaluate(() => document.getElementById('opPropPick').value)) === K_VW1, 'picked Villages of Whitewater (no model)');
  const orphan = await page.evaluate(() => { const b = document.querySelector('[data-op-orphans]'); const li = b && b.querySelector('[data-op-orphan-key]');
    return b ? { n: b.getAttribute('data-op-orphans'), key: li && li.getAttribute('data-op-orphan-key'), text: li && li.textContent, moveDisabled: li && li.querySelector('[data-op-orphan-move]').disabled, moveLabel: li && li.querySelector('[data-op-orphan-move]').textContent } : null; });
  ok(orphan && orphan.n === '1' && orphan.key === K_VW2, 'one stranded record listed, keyed ' + K_VW2 + ' (got ' + JSON.stringify(orphan) + ')');
  ok(orphan && /Villages of Whitewater II/.test(orphan.text) && /1 line/.test(orphan.text), 'listed with its name and line count');
  ok(orphan && orphan.moveDisabled === false && orphan.moveLabel === 'Move to “Villages of Whitewater”', 'Move offered onto the picked property (got "' + (orphan && orphan.moveLabel) + '")');

  // ---- 6. move the stranded model onto Villages of Whitewater, then delete it from there ------------------
  await page.evaluate(() => document.querySelector('[data-op-orphan-move]').click());
  await waitRec(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return !!(s.records && s.records['addr:10400 edgewood rd, harrison, oh 45030']); } catch (e) { return false; } }, 'orphan move');
  r = await records();
  ok(gpr(r[K_VW1]) === 12000 && !r[K_VW2], 'stranded model moved onto ' + K_VW1);
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('opOrphans').hidden), 'stranded list gone after the move');
  const shown = await page.evaluate(() => document.querySelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]').value);
  ok(/12,?000/.test(shown), 'sheet now shows the moved GPR (got "' + shown + '")');
  await page.evaluate(() => document.getElementById('opDeleteBtn').click());
  await page.waitForSelector('#confirmModal:not(.hidden)', { state: 'attached', timeout: 5000 });
  const dlg = await page.evaluate(() => document.getElementById('confirmTitle').textContent);
  ok(/Delete the operating model of “Villages of Whitewater”\?/.test(dlg), 'delete asks first (got "' + dlg + '")');
  await page.evaluate(() => document.getElementById('confirmOk').click());
  await waitRec(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return !(s.records && s.records['addr:10400 edgewood rd, harrison, oh 45030']); } catch (e) { return false; } }, 'delete');
  r = await records();
  ok(Object.keys(r).length === 0, 'store empty after the delete (got ' + Object.keys(r).length + ' records)');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('opManage').hidden), 'manage row gone after the delete');
  const cleared = await page.evaluate(() => document.querySelector('#opSheetMount tr[data-op-code="GPR"] [data-op-input]').value);
  ok(cleared === '', 'sheet GPR blank again (got "' + cleared + '")');

  // ---- 7. a stranded record can be deleted from the list too ---------------------------------------------
  await typeGPR(5000);
  await waitRec(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return !!(s.records && s.records['addr:10400 edgewood rd, harrison, oh 45030']); } catch (e) { return false; } }, 'second record');
  await removeLoan('Villages of Whitewater');
  await H.openUnderwriting(page);
  ok(await page.evaluate(() => (document.querySelector('[data-op-orphans]') || {}).getAttribute && document.querySelector('[data-op-orphans]').getAttribute('data-op-orphans') === '1'), 'stranded record listed without any property picked');
  ok(await page.evaluate(() => document.querySelector('[data-op-orphan-move]').disabled), 'Move disabled with no property picked');
  await page.evaluate(() => document.querySelector('[data-op-orphan-del]').click());
  await page.waitForSelector('#confirmModal:not(.hidden)', { state: 'attached', timeout: 5000 });
  await page.evaluate(() => document.getElementById('confirmOk').click());
  await waitRec(() => { try { const s = JSON.parse(localStorage.getItem('ldsHub.operating.v1') || '{}'); return !s.records || Object.keys(s.records).length === 0; } catch (e) { return false; } }, 'orphan delete');
  r = await records();
  ok(Object.keys(r).length === 0, 'stranded record deleted from the list');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('opOrphans').hidden), 'list hidden again');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();
  console.log(fails.n ? fails.n + ' e2e check(s) FAILED' : 'all e2e checks passed');
  process.exit(fails.n ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
