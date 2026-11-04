import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MinistryPlatform, q } from './mp.js';
import { Square } from './square.js';

const reply = (json, status = 200) => ({ ok: status < 400, status, json: async () => json, text: async () => JSON.stringify(json) });

test('MinistryPlatform client: client-credentials token is cached and sent; queries encoded', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).endsWith('/oauth/connect/token')) return reply({ access_token: 'tok', expires_in: 3600 });
    return reply([{ Contact_ID: 1 }]);
  };
  const mp = new MinistryPlatform({ baseUrl: 'https://mp.olghelotes.org', clientId: 'id', clientSecret: 'sec' }, fetch);
  await mp.get('Contacts', { select: 'Contact_ID', filter: `Email_Address=${q("o'neil@x.org")}`, top: 5 });
  await mp.create('Pledges', [{ Donor_ID: 1 }]);
  assert.equal(calls.filter(c => c[0].includes('/oauth/')).length, 1);
  const tokenBody = String(calls[0][1].body);
  assert.match(tokenBody, /grant_type=client_credentials/); assert.match(tokenBody, /scope=http%3A%2F%2Fwww\.thinkministry\.com/);
  const get = new URL(calls[1][0]);
  assert.equal(get.pathname, '/ministryplatformapi/tables/Contacts');
  assert.equal(get.searchParams.get('$filter'), "Email_Address='o''neil@x.org'");
  assert.equal(calls[1][1].headers.Authorization, 'Bearer tok');
  assert.equal(calls[2][1].method, 'POST'); assert.equal(calls[2][1].body, '[{"Donor_ID":1}]');
});

test('MinistryPlatform client surfaces API errors', async () => {
  const fetch = async url => String(url).includes('oauth') ? reply({ access_token: 't' }) : reply({ Message: 'Invalid column Notes' }, 400);
  const mp = new MinistryPlatform({ baseUrl: 'https://mp.x', clientId: 'a', clientSecret: 'b' }, fetch);
  await assert.rejects(mp.create('Pledges', [{}]), /failed \(400\).*Invalid column/);
});

test('Square client builds a payment link carrying MP ids', async () => {
  let sent;
  const fetch = async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return reply({ payment_link: { id: 'pl', url: 'https://square.link/u/abc', order_id: 'o1' } }); };
  const sq = new Square({ baseUrl: 'https://connect.squareupsandbox.com', accessToken: 'at', apiVersion: '2025-01-23', locationId: 'L1', currency: 'USD' }, fetch);
  const link = await sq.createPledgePaymentLink({ amountCents: 5000, itemName: 'BFT II – First gift', pledgeId: 42, donorId: 9001, contactId: 501, campaignId: 8, buyerEmail: 'm@x.org', donorName: 'Maria Garcia', redirectUrl: 'https://www.olghelotes.org/pledge?olg_pledge=paid' });
  assert.equal(link.url, 'https://square.link/u/abc');
  assert.equal(sent.url, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
  assert.equal(sent.init.headers['Square-Version'], '2025-01-23');
  assert.equal(sent.body.order.location_id, 'L1');
  assert.equal(sent.body.order.reference_id, 'mp-pledge-42');
  assert.deepEqual(sent.body.order.metadata, { mp_pledge_id: '42', mp_donor_id: '9001', mp_contact_id: '501', mp_campaign_id: '8', donor_name: 'Maria Garcia', donor_email: 'm@x.org', source: 'olg-pledge-widget' });
  assert.equal(sent.body.order.line_items[0].base_price_money.amount, 5000);
  assert.equal(sent.body.pre_populated_data.buyer_email, 'm@x.org');
  assert.match(sent.body.payment_note, /MP Pledge 42/);
});

test('clients call fetch as a plain function (Cloudflare "Illegal invocation" regression)', async () => {
  // Cloudflare's fetch throws if called with `this` set to another object.
  function strictFetch(url) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(String(url).includes('oauth') ? reply({ access_token: 't', expires_in: 3600 }) : reply([]));
  }
  const mp = new MinistryPlatform({ baseUrl: 'https://mp.x', clientId: 'a', clientSecret: 'b' }, strictFetch);
  await mp.get('Contacts', { top: 1 });
  const sq = new Square({ baseUrl: 'https://sq.x', accessToken: 'a', apiVersion: 'v', locationId: 'L', currency: 'USD' }, strictFetch);
  await sq.request('GET', '/v2/orders/x');
});
