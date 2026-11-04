// Minimal Square API client + webhook signature verification.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

/**
 * Square signs: HMAC-SHA256( key, notificationUrl + rawBody ), Base64.
 * The URL must be the exact one configured in the Developer Console.
 */
export function verifySquareSignature({ rawBody, signature, signatureKey, notificationUrl }) {
  if (!signature || !signatureKey || !notificationUrl) return false;
  const expected = createHmac('sha256', signatureKey).update(notificationUrl + rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class Square {
  constructor({ baseUrl, accessToken, apiVersion, locationId, currency }, fetchImpl = globalThis.fetch) {
    Object.assign(this, { baseUrl, accessToken, apiVersion, locationId, currency });
    // Wrap fetch: Cloudflare Workers reject fetch() called as a method of another object ("Illegal invocation").
    this.fetch = (...args) => fetchImpl(...args);
  }

  async request(method, path, body) {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Square-Version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (json.errors || []).map(e => `${e.code}: ${e.detail}`).join('; ');
      throw new Error(`Square ${method} ${path} failed (${res.status}) ${detail}`);
    }
    return json;
  }

  /**
   * Create a Square-hosted checkout link for one gift toward a pledge.
   * MP ids ride in the order's reference_id + metadata, and in the payment note,
   * so the webhook can find the pledge again.
   */
  async createPledgePaymentLink({ amountCents, itemName, pledgeId, donorId, contactId, campaignId, buyerEmail, donorName, redirectUrl, idempotencyKey }) {
    const metadata = {
      mp_pledge_id: String(pledgeId ?? ''),
      mp_donor_id: String(donorId ?? ''),
      mp_contact_id: String(contactId ?? ''),
      mp_campaign_id: String(campaignId ?? ''),
      // who pledged (from the form), so unmatched gifts can be identified in MinistryPlatform
      donor_name: String(donorName ?? '').slice(0, 200),
      donor_email: String(buyerEmail ?? '').slice(0, 200),
      source: 'olg-pledge-widget',
    };
    const body = {
      idempotency_key: idempotencyKey || randomUUID(),
      order: {
        location_id: this.locationId,
        reference_id: `mp-pledge-${pledgeId}`.slice(0, 40),
        metadata,
        line_items: [{
          name: itemName.slice(0, 512),
          quantity: '1',
          base_price_money: { amount: amountCents, currency: this.currency },
        }],
      },
      checkout_options: { redirect_url: redirectUrl, ask_for_shipping_address: false },
      payment_note: `MP Pledge ${pledgeId} / Donor ${donorId} / Campaign ${campaignId}`.slice(0, 500),
    };
    if (buyerEmail) body.pre_populated_data = { buyer_email: buyerEmail };
    const json = await this.request('POST', '/v2/online-checkout/payment-links', body);
    return { url: json.payment_link.url, orderId: json.payment_link.order_id, id: json.payment_link.id };
  }

  async getOrder(orderId) {
    const json = await this.request('GET', `/v2/orders/${encodeURIComponent(orderId)}`);
    return json.order;
  }

  async getPayment(paymentId) {
    const json = await this.request('GET', `/v2/payments/${encodeURIComponent(paymentId)}`);
    return json.payment;
  }
}
