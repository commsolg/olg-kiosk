import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readConfig } from './config.js';
import { PledgeService, countInstallments, validatePledgeInput, ValidationError } from './service.js';
import { verifySquareSignature } from './square.js';
import { FakeMinistryPlatform, FakeSquare } from './demo.js';

const quiet = { info() {}, warn() {}, error() {} };
function setup(env = {}) {
  const cfg = readConfig({ APP_SECRET: 'x'.repeat(40), MP_DEFAULT_DONOR_ID: '1', MP_BATCH_ENTRY_TYPE_ID: '3', PUBLIC_URL: 'https://pledge.test', ALLOWED_ORIGINS: 'https://www.olghelotes.org', ...env });
  const mp = new FakeMinistryPlatform();
  const sq = new FakeSquare(cfg.publicUrl);
  const svc = new PledgeService(cfg, mp, sq, quiet);
  svc.today = () => '2026-11-04';
  return { cfg, mp, sq, svc };
}
const base = { campaignId: 8, firstName: 'Maria', lastName: 'Garcia', email: 'Maria@Example.com', amount: 50, amountMode: 'installment', frequency: 'monthly', startDate: '2026-11-15', endDate: '2027-10-15', payNow: 'first', returnUrl: 'https://www.olghelotes.org/pledge' };

test('installment counting', () => {
  assert.equal(countInstallments('monthly', '2026-11-15', '2027-10-15'), 12);
  assert.equal(countInstallments('weekly', '2026-11-01', '2026-11-29'), 5);
  assert.equal(countInstallments('quarterly', '2026-01-31', '2026-12-31'), 4);
  assert.equal(countInstallments('once', '2026-11-01', '2027-11-01'), 1);
  assert.equal(countInstallments('monthly', '2026-01-31', '2026-03-31'), 3); // month-end safe
});

test('pledge card plans: weekly $20 / monthly $80 through Oct 31, 2027', () => {
  const opts = { today: '2026-11-04', allowedCampaignIds: [8] };
  const w = validatePledgeInput({ ...base, frequency: 'weekly', amount: 20, startDate: '2026-11-04', endDate: '2027-10-31' }, opts);
  assert.deepEqual([w.installments, w.total, w.perYear], [52, 1040, 52]);
  const m = validatePledgeInput({ ...base, frequency: 'monthly', amount: 80, startDate: '2026-11-04', endDate: '2027-10-31' }, opts);
  assert.deepEqual([m.installments, m.total], [12, 960]);
  const o = validatePledgeInput({ ...base, frequency: 'once', amountMode: 'total', amount: 80, endDate: null }, opts);
  assert.deepEqual([o.installments, o.total], [1, 80]);
});

test('validation: total vs per-gift, and bad input', () => {
  const opts = { today: '2026-11-04', allowedCampaignIds: [8] };
  const p = validatePledgeInput(base, opts);
  assert.equal(p.total, 600); assert.equal(p.perInstallment, 50); assert.equal(p.perYear, 12);
  const t = validatePledgeInput({ ...base, amountMode: 'total', amount: 1000 }, opts);
  assert.equal(t.perInstallment, 83.33);
  assert.throws(() => validatePledgeInput({ ...base, email: 'nope', amount: 0, campaignId: 3 }, opts), e => {
    assert.ok(e instanceof ValidationError);
    assert.deepEqual(Object.keys(e.errors).sort(), ['amount', 'campaignId', 'email']);
    return true;
  });
  assert.throws(() => validatePledgeInput({ ...base, endDate: '2026-11-01' }, opts), ValidationError);
});

test('campaign info reads goal, pledged and received', async () => {
  const { svc } = setup();
  const c = await svc.getCampaign(8);
  assert.equal(c.name, 'Building Faith Together II');
  assert.equal(c.goal, 594000); assert.equal(c.pledged, 243500); assert.equal(c.received, 48750);
  assert.equal(c.acceptingPledges, true);
  assert.equal(await svc.getCampaign(3), null);
});

test('matched donor: Active pledge + Square link with pledge metadata', async () => {
  const { svc, mp, sq } = setup();
  const r = await svc.submitPledge(base);
  assert.equal(r.matched, true);
  const pledge = mp.tables.Pledges.find(p => p.Pledge_ID === r.pledgeId);
  assert.equal(pledge.Donor_ID, 9001); assert.equal(pledge.Pledge_Status_ID, 1);
  assert.equal(pledge.Total_Pledge, 600); assert.equal(pledge.Installments_Planned, 12);
  assert.equal(sq.links[0].amountCents, 5000);
  assert.equal(sq.links[0].pledgeId, r.pledgeId);
  assert.match(sq.links[0].redirectUrl, /^https:\/\/www\.olghelotes\.org\/pledge\?olg_pledge=paid$/);
  assert.ok(r.checkoutUrl);
});

test('unknown donor: Pending pledge on Default Donor with details in Notes', async () => {
  const { svc, mp } = setup();
  const r = await svc.submitPledge({ ...base, email: 'new@example.com', firstName: 'Ana', payNow: 'none', address: '123 Main St', city: 'Helotes, TX 78023' });
  const pledge = mp.tables.Pledges.find(p => p.Pledge_ID === r.pledgeId);
  assert.equal(r.matched, false); assert.equal(r.checkoutUrl, null);
  assert.equal(pledge.Donor_ID, 1); assert.equal(pledge.Pledge_Status_ID, 4);
  assert.match(pledge.Notes, /Ana Garcia, new@example.com, 123 Main St, Helotes, TX 78023/); assert.match(pledge.Notes, /NOT MATCHED/);
});

test('second pledge from same donor reuses the existing one (no duplicate)', async () => {
  const { svc, mp } = setup();
  const a = await svc.submitPledge(base);
  const b = await svc.submitPledge({ ...base, amount: 75 });
  assert.equal(b.pledgeId, a.pledgeId); assert.equal(b.reused, true);
  assert.equal(mp.tables.Pledges.filter(p => p.Donor_ID === 9001).length, 1);
  assert.match(mp.tables.Pledges.find(p => p.Pledge_ID === a.pledgeId).Notes, /Re-submitted for \$900\.00/);
});

test('return URL from an unapproved site falls back to our thank-you page', async () => {
  const { svc, sq } = setup();
  await svc.submitPledge({ ...base, returnUrl: 'https://evil.example/phish' });
  assert.equal(sq.links[0].redirectUrl, 'https://pledge.test/thanks?olg_pledge=paid');
});

test('completed Square payment posts Donation + Distribution into a daily batch, once', async () => {
  const { svc, mp, sq } = setup();
  const r = await svc.submitPledge(base);
  const orderId = [...sq.orders.keys()][0];
  const event = { type: 'payment.updated', data: { object: { payment: { id: 'sq_pay_1', status: 'COMPLETED', order_id: orderId, created_at: '2026-11-05T03:30:00Z', amount_money: { amount: 5000 }, buyer_email_address: 'maria@example.com' } } } };
  const out = await svc.handleSquareEvent(event);
  assert.equal(out.action, 'posted');
  const d = mp.tables.Donations[0];
  assert.equal(d.Donor_ID, 9001); assert.equal(d.Donation_Amount, 50); assert.equal(d.Transaction_Code, 'sq_pay_1');
  assert.equal(d.Donation_Date, '2026-11-04'); // 03:30 UTC = evening of the 4th in Central time
  assert.equal(d.Payment_Type_ID, 7); // resolved "Square" by name
  const dist = mp.tables.Donation_Distributions.at(-1);
  assert.deepEqual([dist.Program_ID, dist.Amount, dist.Pledge_ID], [60, 50, r.pledgeId]);
  const batch = mp.tables.Batches[0];
  assert.equal(batch.Batch_Name, 'Square Online 2026-11-04'); assert.equal(batch.Batch_Total, 50); assert.equal(batch.Item_Count, 1);
  // Square retries / duplicate events are ignored
  assert.equal((await svc.handleSquareEvent(event)).action, 'skipped');
  assert.equal(mp.tables.Donations.length, 1);
  // a second payment the same day joins the same batch
  await svc.handleSquareEvent({ ...event, data: { object: { payment: { ...event.data.object.payment, id: 'sq_pay_2' } } } });
  assert.equal(mp.tables.Batches.length, 1); assert.equal(mp.tables.Batches[0].Batch_Total, 100);
});

test('finalized batch is never added to', async () => {
  const { svc, mp } = setup();
  mp.tables.Batches.push({ Batch_ID: 77, Batch_Name: 'Square Online 2026-11-04', Batch_Total: 10, Item_Count: 1, Finalize_Date: '2026-11-04' });
  const b = await svc.findOrCreateBatch('2026-11-04');
  assert.notEqual(b.Batch_ID, 77); assert.equal(b.Batch_Name, 'Square Online 2026-11-04 (2)');
});

test('ignores non-completed, non-widget and refund events safely', async () => {
  const { svc, mp, sq } = setup();
  sq.orders.set('pos-order', { id: 'pos-order', metadata: {} });
  assert.equal((await svc.handleSquareEvent({ type: 'payment.created', data: { object: { payment: { id: 'p', status: 'PENDING' } } } })).action, 'ignored');
  assert.equal((await svc.handleSquareEvent({ type: 'payment.updated', data: { object: { payment: { id: 'p2', status: 'COMPLETED', order_id: 'pos-order', amount_money: { amount: 500 } } } } })).reason, 'not a pledge payment');
  assert.equal((await svc.handleSquareEvent({ type: 'refund.created', data: { object: { refund: { id: 'r1', payment_id: 'p' } } } })).action, 'refund_logged');
  assert.equal(mp.tables.Donations.length, 0);
});

test('signed pay links reject tampering', async () => {
  const { svc, sq } = setup();
  const r = await svc.submitPledge({ ...base, payNow: 'none' });
  const good = svc.payToken(r.pledgeId);
  assert.equal(await svc.createPayLinkForPledge(r.pledgeId, 'wrong'), null);
  assert.equal(await svc.createPayLinkForPledge(r.pledgeId + 1, good), null);
  assert.ok(await svc.createPayLinkForPledge(r.pledgeId, good));
  assert.equal(sq.links.at(-1).amountCents, 5000);
});

test('Square webhook signature: URL + raw body, constant-time', () => {
  const key = 'sig-key'; const url = 'https://pledge.test/square/webhook'; const body = '{"type":"payment.updated"}';
  const sig = createHmac('sha256', key).update(url + body).digest('base64');
  assert.equal(verifySquareSignature({ rawBody: body, signature: sig, signatureKey: key, notificationUrl: url }), true);
  assert.equal(verifySquareSignature({ rawBody: body + ' ', signature: sig, signatureKey: key, notificationUrl: url }), false);
  assert.equal(verifySquareSignature({ rawBody: body, signature: sig, signatureKey: key, notificationUrl: url + '/' }), false);
  assert.equal(verifySquareSignature({ rawBody: body, signature: undefined, signatureKey: key, notificationUrl: url }), false);
});

test('staff contact without donor record, and a stranger: both clearly identified for Assign Donor', async () => {
  const { svc, mp, sq } = setup();
  mp.tables.Contacts.push({ Contact_ID: 777, First_Name: 'Jacob', Last_Name: 'Noble', Email_Address: 'jnoble@example.org', Donor_Record: null });
  // has a Contact, no donor record
  const a = await svc.submitPledge({ ...base, firstName: 'Jacob', lastName: 'Noble', email: 'jnoble@example.org' });
  assert.match(mp.tables.Pledges.find(p => p.Pledge_ID === a.pledgeId).Notes, /NO DONOR RECORD: matches MinistryPlatform Contact #777/);
  const orderA = [...sq.orders.keys()].at(-1);
  // Square sandbox often omits buyer_email_address: the form's email from metadata is used instead
  await svc.handleSquareEvent({ type: 'payment.updated', data: { object: { payment: { id: 'pa', status: 'COMPLETED', order_id: orderA, created_at: '2026-11-04T18:00:00Z', amount_money: { amount: 500 }, receipt_number: 'R1' } } } });
  const da = mp.tables.Donations.at(-1);
  assert.equal(da.Donor_ID, 1);
  assert.equal(da.Notes, `Pledge #${a.pledgeId} · Jacob Noble · jnoble@example.org · Contact #777 (no donor record) · Square payment pa · receipt R1 · NO DONOR RECORD: create one with Assign Donor`);
  // not in MinistryPlatform at all
  const b = await svc.submitPledge({ ...base, firstName: 'Ana', lastName: 'Ruiz', email: 'ana@new.org' });
  const orderB = [...sq.orders.keys()].at(-1);
  await svc.handleSquareEvent({ type: 'payment.updated', data: { object: { payment: { id: 'pb', status: 'COMPLETED', order_id: orderB, created_at: '2026-11-04T18:00:00Z', amount_money: { amount: 500 } } } } });
  assert.equal(mp.tables.Donations.at(-1).Notes, `Pledge #${b.pledgeId} · Ana Ruiz · ana@new.org · Square payment pb · UNMATCHED DONOR: please assign`);
  // matched donor: no flag, but still says who and which pledge
  const c = await svc.submitPledge(base);
  const orderC = [...sq.orders.keys()].at(-1);
  await svc.handleSquareEvent({ type: 'payment.updated', data: { object: { payment: { id: 'pc', status: 'COMPLETED', order_id: orderC, created_at: '2026-11-04T18:00:00Z', amount_money: { amount: 500 } } } } });
  const dc = mp.tables.Donations.at(-1);
  assert.equal(dc.Donor_ID, 9001);
  assert.equal(dc.Notes, `Pledge #${c.pledgeId} · Maria Garcia · maria@example.com · Square payment pc`);
});
