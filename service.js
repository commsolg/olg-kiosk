// Business logic: pledges in MinistryPlatform, payments through Square,
// and posting completed Square payments back into MinistryPlatform.
import { createHmac, randomUUID } from 'node:crypto';
import { q } from './mp.js';

export const FREQUENCIES = {
  once: { perYear: 1, step: null },
  weekly: { perYear: 52, step: d => addDays(d, 7) },
  monthly: { perYear: 12, step: d => addMonths(d, 1) },
  quarterly: { perYear: 4, step: d => addMonths(d, 3) },
  annually: { perYear: 1, step: d => addMonths(d, 12) },
};

// ---------- date helpers (dates are 'YYYY-MM-DD' strings, no time zone drift) ----------
const toDate = s => new Date(`${s}T12:00:00Z`);
const fmt = d => d.toISOString().slice(0, 10);
function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
function addMonths(s, n) {
  const d = toDate(s); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}
export function localDate(when, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);
}

/** Number of gifts between start and end (inclusive) for a frequency. */
export function countInstallments(frequency, start, end) {
  const f = FREQUENCIES[frequency];
  if (!f || !f.step) return 1;
  let n = 0;
  for (let d = start; d <= end && n < 1000; d = f.step(d)) n++;
  return Math.max(n, 1);
}

const round2 = n => Math.round(n * 100) / 100;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(toDate(s).getTime());
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);


const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
const formatPhone = s => { const d = digits(s); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(s || '').trim(); };
/** "Helotes, TX 78023" or "Helotes TX 78023-1234" -> { city, state, zip } */
export function parseCityStateZip(s) {
  const m = String(s || '').trim().match(/^(.+?)[,\s]+([A-Za-z]{2})\.?\s+(\d{5})(?:-\d{4})?$/);
  return m ? { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] } : null;
}

/** MinistryPlatform's Pledges.Notes holds about 500 characters; longer text makes the whole save fail. */
export const NOTES_MAX = 500;
export const clipNotes = (text, max = NOTES_MAX) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
/** Add a line to existing notes, keeping the first submission and the newest line within the limit. */
export function appendNotes(existing, line, max = NOTES_MAX) {
  line = clipNotes(line, Math.floor(max / 2));
  if (!existing) return line;
  const room = max - line.length - 2;
  return room > 20 ? `${clipNotes(existing, room)}\n${line}` : line;
}

export class ValidationError extends Error {
  constructor(errors) { super('Invalid pledge'); this.errors = errors; }
}

/** Check and normalise what the widget sends. Returns the pledge plan. */
/**
 * termMonths: when set (e.g. 12), every recurring pledge runs exactly that long from its first gift,
 *   whatever end date was sent (weekly = 52 gifts, monthly = 12 for 12 months).
 * frequencies: when set, only these are accepted (e.g. ['weekly','monthly','once']).
 */
export function fixedTermEnd(frequency, start, termMonths) {
  if (frequency === 'weekly') return addDays(start, 7 * (Math.round(52 * termMonths / 12) - 1));
  const step = { monthly: 1, quarterly: 3, annually: 12 }[frequency];
  return step ? addMonths(start, Math.max(termMonths - step, 0)) : start;
}

export function validatePledgeInput(body, { today, allowedCampaignIds, termMonths = 0, frequencies = null }) {
  const errors = {};
  const v = {
    campaignId: Number(body.campaignId),
    firstName: clean(body.firstName, 50),
    lastName: clean(body.lastName, 50),
    email: clean(body.email, 254).toLowerCase(),
    phone: clean(body.phone, 30),
    address: clean(body.address, 120),
    city: clean(body.city, 120),
    language: body.language === 'es' ? 'es' : 'en',
    amountMode: body.amountMode === 'installment' ? 'installment' : 'total',
    amount: Number(body.amount),
    frequency: body.frequency in FREQUENCIES ? body.frequency : null,
    startDate: body.startDate || today,
    endDate: body.endDate || null,
    payNow: ['none', 'first', 'full'].includes(body.payNow) ? body.payNow : 'none', // 'full' only for one-time gifts (enforced below)
    returnUrl: clean(body.returnUrl, 1000),
  };
  if (!allowedCampaignIds.includes(v.campaignId)) errors.campaignId = 'unknown_campaign';
  if (!v.firstName) errors.firstName = 'required';
  if (!v.lastName) errors.lastName = 'required';
  if (!EMAIL.test(v.email)) errors.email = 'invalid_email';
  if (!Number.isFinite(v.amount) || v.amount < 1 || v.amount > 1_000_000) errors.amount = 'invalid_amount';
  if (!v.frequency) errors.frequency = 'required';
  else if (frequencies && !frequencies.includes(v.frequency)) errors.frequency = 'not_allowed';
  if (!isDate(v.startDate) || v.startDate < addDays(today, -1)) errors.startDate = 'invalid_date';
  else if (termMonths && v.startDate > addDays(today, 31)) errors.startDate = 'invalid_date';
  if (v.frequency && v.frequency !== 'once' && termMonths && !errors.startDate) {
    v.endDate = fixedTermEnd(v.frequency, v.startDate, termMonths); // fixed term: ignore any other end date
  } else if (v.frequency && v.frequency !== 'once') {
    if (!isDate(v.endDate) || v.endDate < v.startDate) errors.endDate = 'invalid_date';
    else if (v.endDate > addMonths(v.startDate, 120)) errors.endDate = 'too_far';
  } else {
    v.endDate = v.startDate;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  // Recurring pledges are never paid in full up front: card payment now = the first gift only
  if (v.frequency !== 'once' && v.payNow === 'full') v.payNow = 'first';

  const installments = countInstallments(v.frequency, v.startDate, v.endDate);
  const total = v.amountMode === 'installment' ? round2(v.amount * installments) : round2(v.amount);
  const perInstallment = round2(total / installments);
  if (total > 1_000_000) throw new ValidationError({ amount: 'invalid_amount' });
  return { ...v, installments, total, perInstallment, perYear: FREQUENCIES[v.frequency].perYear };
}

export class PledgeService {
  constructor(cfg, mp, square, log = console) {
    Object.assign(this, { cfg, mp, square, log });
    this.cache = new Map();
    this.inflight = new Set();
  }

  async cached(key, ms, fn) {
    const hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = await fn();
    this.cache.set(key, { value, until: Date.now() + ms });
    return value;
  }

  today() { return localDate(new Date(), this.cfg.timezone); }

  // ---------- lookups (resolved by name so IDs don't have to be hard-coded) ----------
  lookups() {
    return this.cached('lookups', 60 * 60_000, async () => {
      const statuses = await this.mp.get('Pledge_Statuses', { select: 'Pledge_Status_ID,Pledge_Status' });
      const byName = n => statuses.find(s => s.Pledge_Status?.toLowerCase() === n.toLowerCase())?.Pledge_Status_ID;
      const active = byName(this.cfg.mp.pledgeStatusActiveName);
      const pending = byName(this.cfg.mp.pledgeStatusPendingName) ?? active;
      const completed = byName('Completed');
      if (!active) throw new Error(`Pledge status "${this.cfg.mp.pledgeStatusActiveName}" not found in MinistryPlatform`);

      let paymentTypeId = this.cfg.mp.paymentTypeId;
      if (!paymentTypeId) {
        const types = await this.mp.get('Payment_Types', {
          select: 'Payment_Type_ID,Payment_Type', filter: `Payment_Type LIKE ${q(`%${this.cfg.mp.paymentTypeName}%`)}`,
        });
        paymentTypeId = types[0]?.Payment_Type_ID;
        if (!paymentTypeId) throw new Error(`No Payment Type containing "${this.cfg.mp.paymentTypeName}". Create one or set MP_PAYMENT_TYPE_ID.`);
      }
      return { active, pending, completed, paymentTypeId };
    });
  }

  // ---------- campaign info shown on the widget ----------
  getCampaign(campaignId) {
    campaignId = Number(campaignId);
    if (!this.cfg.mp.allowedCampaignIds.includes(campaignId)) return null;
    return this.cached(`campaign:${campaignId}`, 5 * 60_000, async () => {
      const [c] = await this.mp.get('Pledge_Campaigns', {
        select: 'Pledge_Campaign_ID,Campaign_Name,Description,Campaign_Goal,Start_Date,End_Date,Allow_Online_Pledge,Online_Thank_You_Message',
        filter: `Pledge_Campaign_ID=${campaignId}`,
      });
      if (!c) return null;
      const { active, completed } = await this.lookups();
      const statusIds = [active, completed].filter(Boolean).join(',');
      const pledges = await this.mp.getAll('Pledges', {
        select: 'Total_Pledge', filter: `Pledge_Campaign_ID=${campaignId} AND Pledge_Status_ID IN (${statusIds})`,
      });
      const programId = this.cfg.mp.campaignPrograms[campaignId];
      let received = 0;
      if (programId) {
        const since = String(c.Start_Date || '').slice(0, 10);
        const gifts = await this.mp.getAll('Donation_Distributions', {
          select: 'Amount',
          filter: `Program_ID=${programId}` + (since ? ` AND Donation_ID_Table.Donation_Date >= ${q(since)}` : ''),
        });
        received = gifts.reduce((s, g) => s + (Number(g.Amount) || 0), 0);
      }
      return {
        id: c.Pledge_Campaign_ID,
        name: c.Campaign_Name,
        description: c.Description || '',
        goal: Number(c.Campaign_Goal) || 0,
        startDate: c.Start_Date?.slice(0, 10) || null,
        endDate: c.End_Date?.slice(0, 10) || null,
        acceptingPledges: !!c.Allow_Online_Pledge && (!c.End_Date || c.End_Date.slice(0, 10) >= this.today()),
        thankYouMessage: c.Online_Thank_You_Message || '',
        pledged: round2(pledges.reduce((s, p) => s + (Number(p.Total_Pledge) || 0), 0)),
        pledgeCount: pledges.length,
        received: round2(received),
      };
    });
  }

  // ---------- donor matching ----------
  /** Match a person to an existing Contact (+ Donor) by email (and name when several share an email). */
  async findDonorByEmail(email, firstName = '', lastName = '') {
    if (!email) return null;
    const rows = await this.mp.get('Contacts', {
      select: 'Contact_ID,First_Name,Nickname,Last_Name,Donor_Record',
      filter: `Email_Address=${q(email)}`, top: 10,
    });
    if (!rows.length) return null;
    const lc = s => String(s || '').toLowerCase();
    const byName = list => list.find(r => lc(r.Last_Name) === lc(lastName) && [lc(r.First_Name), lc(r.Nickname)].includes(lc(firstName)))
      || list.find(r => lc(r.Last_Name) === lc(lastName)) || list[0];
    const withDonor = rows.filter(r => r.Donor_Record);
    const best = withDonor.length ? byName(withDonor) : byName(rows);
    const sameName = lc(best.Last_Name) === lc(lastName) && [lc(best.First_Name), lc(best.Nickname)].includes(lc(firstName));
    return {
      contactId: best.Contact_ID, donorId: best.Donor_Record || null,
      nameMismatch: !!(firstName || lastName) && !sameName,
      matchedName: `${best.Nickname || best.First_Name || ''} ${best.Last_Name || ''}`.trim(),
    };
  }

  /** No email match: same first (or nickname) + last name AND same phone number = same person. */
  async findContactByNameAndPhone(firstName, lastName, phone) {
    const want = digits(phone);
    if (want.length !== 10 || !firstName || !lastName) return null;
    const sel = { select: 'Contact_ID,Mobile_Phone,Donor_Record,Household_ID', top: 25 };
    const rows = [
      ...await this.mp.get('Contacts', { ...sel, filter: `Last_Name=${q(lastName)} AND First_Name=${q(firstName)}` }),
      ...await this.mp.get('Contacts', { ...sel, filter: `Last_Name=${q(lastName)} AND Nickname=${q(firstName)}` }),
    ];
    const hits = [...new Map(rows.filter(r => digits(r.Mobile_Phone) === want).map(r => [r.Contact_ID, r])).values()];
    return hits.length === 1 ? { contactId: hits[0].Contact_ID, donorId: hits[0].Donor_Record || null } : null;
  }

  /** Create a donor record for a contact and link it (Contacts.Donor_Record). */
  async createDonorFor(contactId, hasMailingAddress = true) {
    const m = this.cfg.mp;
    const [donor] = await this.mp.create('Donors', [{
      Contact_ID: contactId,
      Statement_Frequency_ID: m.statementFrequencyId,
      Statement_Type_ID: m.statementTypeId,
      Statement_Method_ID: hasMailingAddress ? m.statementMethodId : m.statementMethodNoAddressId,
      Setup_Date: this.today(),
      Cancel_Envelopes: false,
    }]);
    await this.mp.update('Contacts', [{ Contact_ID: contactId, Donor_Record: donor.Donor_ID }]);
    return donor.Donor_ID;
  }

  /**
   * Create a Contact for someone new to MinistryPlatform.
   * No Household by default (households = registered parishioners); the address stays in the pledge notes.
   * With MP_CREATE_HOUSEHOLDS=1 it also creates a Household (+ Address when one was given).
   */
  async createContact(plan) {
    const m = this.cfg.mp;
    let householdId = null; let addressId = null;
    if (m.createHouseholds) {
      const csz = parseCityStateZip(plan.city);
      if (plan.address && csz) {
        const [addr] = await this.mp.create('Addresses', [{
          Address_Line_1: plan.address, City: csz.city, 'State/Region': csz.state, Postal_Code: csz.zip, Do_Not_Validate: false,
        }]);
        addressId = addr.Address_ID;
      }
      const household = {
        Household_Name: plan.lastName,
        Home_Phone_Unlisted: false, Home_Address_Unlisted: false, Bulk_Mail_Opt_Out: false, Repeats_Annually: false,
        Household_Source_ID: m.householdSourceId,
      };
      if (addressId) household.Address_ID = addressId;
      if (m.congregationId) household.Congregation_ID = m.congregationId;
      householdId = (await this.mp.create('Households', [household]))[0].Household_ID;
    }
    const contact = {
      Company: false,
      Display_Name: `${plan.lastName}, ${plan.firstName}`,
      First_Name: plan.firstName, Nickname: plan.firstName, Last_Name: plan.lastName,
      Email_Address: plan.email,
      Contact_Status_ID: m.contactStatusId,
      Bulk_Email_Opt_Out: false, Email_Unlisted: false, Mobile_Phone_Unlisted: false, Remove_From_Directory: false,
      Texting_Opt_In_Type_ID: 2,
    };
    if (householdId) { contact.Household_ID = householdId; contact.Household_Position_ID = m.householdPositionId; }
    if (plan.phone) contact.Mobile_Phone = formatPhone(plan.phone);
    const [ct] = await this.mp.create('Contacts', [contact]);
    return { contactId: ct.Contact_ID, householdId, addressId };
  }

  /**
   * Find, or create, the donor this pledge belongs to.
   * Never throws: if creating records fails, the gift goes to the Default Donor with a note.
   */
  async resolveDonor(plan) {
    const m = this.cfg.mp;
    const found = await this.findDonorByEmail(plan.email, plan.firstName, plan.lastName)
      || await this.findContactByNameAndPhone(plan.firstName, plan.lastName, plan.phone);
    const mismatch = found?.nameMismatch ? ` NAME CHECK: email belongs to ${found.matchedName}, but the form says ${plan.firstName} ${plan.lastName} (shared family email?). Review.` : '';
    if (found?.donorId) return { donorId: found.donorId, contactId: found.contactId, matched: true, note: mismatch };
    try {
      if (found?.contactId) {
        if (!m.createDonors) return { donorId: m.defaultDonorId, contactId: found.contactId, matched: false, note: ` NO DONOR RECORD: matches MinistryPlatform Contact #${found.contactId}, which has no donor record. Create one with Assign Donor.` };
        const donorId = await this.createDonorFor(found.contactId, true);
        return { donorId, contactId: found.contactId, matched: true, note: ` Donor #${donorId} created by the pledge widget for existing Contact #${found.contactId}.${mismatch}` };
      }
      if (!m.createContacts) return { donorId: m.defaultDonorId, contactId: null, matched: false, note: ' NOT MATCHED to a donor: please assign.' };
      const made = await this.createContact(plan);
      const donorId = await this.createDonorFor(made.contactId, !!made.addressId);
      return { donorId, contactId: made.contactId, matched: true, created: made, note: made.householdId
        ? ` NEW: Contact #${made.contactId}, Household #${made.householdId}${made.addressId ? '' : ' (no address)'} and Donor #${donorId} created by the pledge widget; check for a duplicate person if the name looks familiar.`
        : ` NEW: Contact #${made.contactId} and Donor #${donorId} created by the pledge widget (not registered: no household; address above). Check for a duplicate person if the name looks familiar.` };
    } catch (e) {
      this.log.error?.(`[donor] could not create records for ${plan.email}: ${e.message}`);
      return { donorId: m.defaultDonorId, contactId: found?.contactId || null, matched: false, note: ` NOT MATCHED: automatic donor setup failed (${e.message.slice(0, 160)}). Please assign.` };
    }
  }

  // ---------- pledge submission from the widget ----------
  async submitPledge(body) {
    const plan = validatePledgeInput(body, { today: this.today(), allowedCampaignIds: this.cfg.mp.allowedCampaignIds, termMonths: this.cfg.mp.termMonths, frequencies: this.cfg.mp.frequencies });
    const campaign = await this.getCampaign(plan.campaignId);
    if (!campaign || !campaign.acceptingPledges) throw new ValidationError({ campaignId: 'not_accepting' });
    const { active, pending } = await this.lookups();

    const match = await this.resolveDonor(plan);
    const { matched, donorId } = match;
    const submitted = `Submitted online (OLG pledge widget, ${plan.language.toUpperCase()}): ${plan.firstName} ${plan.lastName}, ${plan.email}${plan.phone ? `, ${plan.phone}` : ''}${plan.address || plan.city ? `, ${[plan.address, plan.city].filter(Boolean).join(', ')}` : ''}.`;

    // Avoid duplicate pledges: reuse this donor's existing pledge in the campaign.
    let pledgeId = null; let reused = false;
    if (matched) {
      const [existing] = await this.mp.get('Pledges', {
        select: 'Pledge_ID,Total_Pledge,Notes', filter: `Donor_ID=${donorId} AND Pledge_Campaign_ID=${plan.campaignId} AND Pledge_Status_ID IN (${[active, pending].join(',')})`, top: 1,
      });
      if (existing) {
        pledgeId = existing.Pledge_ID; reused = true;
        // Keep the existing pledge (no duplicate) but record what was submitted for staff review.
        const note = `${submitted} Re-submitted for $${plan.total.toFixed(2)} (${plan.frequency}); existing pledge kept at $${Number(existing.Total_Pledge).toFixed(2)}: review.`;
        try {
          await this.mp.update('Pledges', [{ Pledge_ID: pledgeId, Notes: appendNotes(existing.Notes, note) }]);
        } catch (e) { // a note is never worth losing the pledge or the payment over
          this.log.warn?.(`[pledge] could not add review note to pledge ${pledgeId}: ${e.message}`);
        }
      }
    }

    if (!pledgeId) {
      const status = matched && !this.cfg.mp.alwaysPending ? active : pending;
      const [created] = await this.mp.create('Pledges', [{
        Donor_ID: donorId,
        Pledge_Campaign_ID: plan.campaignId,
        Pledge_Status_ID: status,
        Total_Pledge: plan.total,
        Installments_Planned: plan.installments,
        Installments_Per_Year: plan.perYear,
        First_Installment_Date: plan.startDate,
        Notes: clipNotes(`${submitted} ${plan.frequency}, ${plan.installments} gift(s) of $${plan.perInstallment.toFixed(2)} from ${plan.startDate} to ${plan.endDate}.${match.note}`),
      }]);
      pledgeId = created.Pledge_ID;
    }
    this.cache.delete(`campaign:${plan.campaignId}`);
    this.log.info?.(`[pledge] ${reused ? 'reused' : 'created'} pledge ${pledgeId} donor ${donorId} matched=${matched}`);

    // The pledge is already saved. A Square problem must never turn that into an error for the donor.
    let checkoutUrl = null; let paymentUnavailable = false;
    if (plan.payNow !== 'none') {
      const amount = plan.payNow === 'full' ? plan.total : plan.perInstallment;
      const args = {
        amountCents: Math.round(amount * 100),
        itemName: this.cfg.square.itemName, // what the donor sees on Square's checkout and receipt
        pledgeId, donorId, contactId: match?.contactId, campaignId: plan.campaignId,
        buyerEmail: plan.email, donorName: `${plan.firstName} ${plan.lastName}`,
        redirectUrl: this.returnUrl(plan.returnUrl, 'paid'),
      };
      try {
        checkoutUrl = (await this.square.createPledgePaymentLink({ ...args, idempotencyKey: randomUUID() })).url;
      } catch (e) {
        try {
          // Square rejects some addresses (e.g. reserved test domains): open checkout without pre-filling it
          if (!/INVALID_EMAIL/i.test(e.message)) throw e;
          this.log.warn?.(`[square] email not accepted for pre-fill on pledge ${pledgeId}; opening checkout without it`);
          checkoutUrl = (await this.square.createPledgePaymentLink({ ...args, prefillEmail: false, idempotencyKey: randomUUID() })).url;
        } catch (e2) {
          paymentUnavailable = true;
          this.log.error?.(`[square] could not open checkout for pledge ${pledgeId}: ${e2.message}`);
        }
      }
    }
    return {
      pledgeId, reused, matched, checkoutUrl, paymentUnavailable,
      total: plan.total, installments: plan.installments, perInstallment: plan.perInstallment,
      thankYouMessage: campaign.thankYouMessage,
    };
  }

  returnUrl(requested, status) {
    let url;
    try { url = new URL(requested); } catch { url = null; }
    const allowed = url && this.cfg.allowedOrigins.includes(url.origin);
    const out = allowed ? url : new URL(`${this.cfg.publicUrl}/thanks`);
    out.searchParams.set('olg_pledge', status);
    return out.toString();
  }

  /** Name of the Square location payments go to, so /health shows where money is landing. */
  squareLocation() {
    return this.cached('square-location', 60 * 60_000, async () => {
      try {
        const l = await this.square.getLocation(this.cfg.square.locationId);
        return { id: l.id, name: l.name, status: l.status };
      } catch (e) { return { id: this.cfg.square.locationId, error: e.message.slice(0, 160) }; }
    });
  }

  // ---------- signed "pay toward my pledge" links (for reminder emails) ----------
  payToken(pledgeId) {
    return createHmac('sha256', this.cfg.appSecret).update(`pay:${pledgeId}`).digest('base64url').slice(0, 24);
  }
  payLink(pledgeId) { return `${this.cfg.publicUrl}/pay/${pledgeId}?t=${this.payToken(pledgeId)}`; }

  async createPayLinkForPledge(pledgeId, token, amountOverride) {
    pledgeId = Number(pledgeId);
    if (!Number.isInteger(pledgeId) || token !== this.payToken(pledgeId)) return null;
    const [p] = await this.mp.get('Pledges', {
      select: 'Pledge_ID,Donor_ID,Pledge_Campaign_ID,Total_Pledge,Installments_Planned', filter: `Pledge_ID=${pledgeId}`,
    });
    if (!p || !this.cfg.mp.allowedCampaignIds.includes(p.Pledge_Campaign_ID)) return null;
    const campaign = await this.getCampaign(p.Pledge_Campaign_ID);
    const suggested = round2(p.Total_Pledge / Math.max(p.Installments_Planned || 1, 1));
    const amount = Number.isFinite(amountOverride) && amountOverride >= 1 && amountOverride <= 1_000_000 ? amountOverride : suggested;
    const link = await this.square.createPledgePaymentLink({
      amountCents: Math.round(amount * 100), itemName: this.cfg.square.itemName,
      pledgeId, donorId: p.Donor_ID, campaignId: p.Pledge_Campaign_ID,
      redirectUrl: this.returnUrl('', 'paid'),
    });
    return link.url;
  }

  // ---------- Square webhook -> MinistryPlatform donation ----------
  async handleSquareEvent(event) {
    const type = event?.type || '';
    if (type.startsWith('refund.')) {
      const r = event.data?.object?.refund;
      this.log.warn?.(`[refund] Square refund ${r?.id} for payment ${r?.payment_id} status ${r?.status}: finance staff should adjust the MinistryPlatform donation.`);
      return { action: 'refund_logged' };
    }
    if (type !== 'payment.created' && type !== 'payment.updated') return { action: 'ignored', reason: type };
    const payment = event.data?.object?.payment;
    if (!payment || payment.status !== 'COMPLETED') return { action: 'ignored', reason: `status ${payment?.status}` };
    return this.postPayment(payment);
  }

  async postPayment(payment) {
    if (this.inflight.has(payment.id)) return { action: 'skipped', reason: 'in progress' };
    this.inflight.add(payment.id);
    try {
      const [dup] = await this.mp.get('Donations', { select: 'Donation_ID', filter: `Transaction_Code=${q(payment.id)}`, top: 1 });
      if (dup) return { action: 'skipped', reason: 'already posted', donationId: dup.Donation_ID };

      // Only money taken at the campaign's Square location (e.g. "BFT Second Phase") is ever posted.
      const loc = this.cfg.square.locationId;
      if (loc && payment.location_id && payment.location_id !== loc) {
        this.log.warn?.(`[square] ignored payment ${payment.id} from location ${payment.location_id} (campaign location is ${loc})`);
        return { action: 'ignored', reason: 'other Square location' };
      }
      const order = payment.order_id ? await this.square.getOrder(payment.order_id) : null;
      const meta = order?.metadata || {};
      const fromWidget = meta.source === 'olg-pledge-widget';
      if (!fromWidget && !this.cfg.square.postAllPayments) return { action: 'ignored', reason: 'not a pledge payment' };

      const campaignId = Number(meta.mp_campaign_id) || this.cfg.mp.allowedCampaignIds[0];
      const programId = this.cfg.mp.campaignPrograms[campaignId];
      if (!programId) throw new Error(`No Program configured for campaign ${campaignId} (MP_CAMPAIGN_PROGRAMS)`);
      const pledgeId = Number(meta.mp_pledge_id) || null;

      const email = payment.buyer_email_address || meta.donor_email || '';
      let donorId = Number(meta.mp_donor_id) || null;
      let contactId = Number(meta.mp_contact_id) || null;
      if (!donorId || donorId === this.cfg.mp.defaultDonorId) {
        // maybe staff assigned the donor since the pledge, or a Contact exists
        const m = await this.findDonorByEmail(email);
        donorId = m?.donorId || this.cfg.mp.defaultDonorId;
        contactId = contactId || m?.contactId || null;
      }
      const unmatched = donorId === this.cfg.mp.defaultDonorId;
      const amount = round2(((payment.total_money || payment.amount_money)?.amount || 0) / 100);
      const date = localDate(new Date(payment.created_at || Date.now()), this.cfg.timezone);
      const { paymentTypeId } = await this.lookups();
      const batch = await this.findOrCreateBatch(date);

      // Who gave comes first, so staff can identify an unmatched gift at a glance.
      const notes = [
        pledgeId && `Pledge #${pledgeId}`,
        meta.donor_name, email,
        unmatched && contactId && `Contact #${contactId} (no donor record)`,
        `Square payment ${payment.id}`,
        payment.receipt_number && `receipt ${payment.receipt_number}`,
        payment.card_details?.card?.last_4 && `card ending ${payment.card_details.card.last_4}`,
        unmatched && (contactId ? 'NO DONOR RECORD: create one with Assign Donor' : 'UNMATCHED DONOR: please assign'),
      ].filter(Boolean).join(' · ');

      const [donation] = await this.mp.create('Donations', [{
        Donor_ID: donorId,
        Donation_Amount: amount,
        Donation_Date: date,
        Payment_Type_ID: paymentTypeId,
        Batch_ID: batch.Batch_ID,
        Transaction_Code: payment.id,
        Notes: clipNotes(notes),
      }]);
      const dist = { Donation_ID: donation.Donation_ID, Program_ID: programId, Amount: amount };
      if (pledgeId && this.cfg.mp.setPledgeOnDistribution) dist.Pledge_ID = pledgeId;
      if (this.cfg.mp.congregationId) dist.Congregation_ID = this.cfg.mp.congregationId;
      await this.mp.create('Donation_Distributions', [dist]);

      await this.mp.update('Batches', [{
        Batch_ID: batch.Batch_ID,
        Batch_Total: round2((Number(batch.Batch_Total) || 0) + amount),
        Item_Count: (Number(batch.Item_Count) || 0) + 1,
      }]);
      this.cache.delete(`campaign:${campaignId}`);
      this.log.info?.(`[donation] posted ${payment.id} $${amount} donor ${donorId} pledge ${pledgeId} batch ${batch.Batch_ID}`);
      return { action: 'posted', donationId: donation.Donation_ID, batchId: batch.Batch_ID, donorId, pledgeId, amount };
    } finally {
      this.inflight.delete(payment.id);
    }
  }

  /** One open batch per day, e.g. "Square Online 2026-11-04". */
  async findOrCreateBatch(date) {
    const name = `${this.cfg.mp.batchNamePrefix} ${date}`;
    const rows = await this.mp.get('Batches', {
      select: 'Batch_ID,Batch_Name,Batch_Total,Item_Count,Finalize_Date', filter: `Batch_Name LIKE ${q(`${name}%`)}`,
    });
    const open = rows.find(r => !r.Finalize_Date);
    if (open) return open;
    const rec = {
      Batch_Name: rows.length ? `${name} (${rows.length + 1})` : name,
      Setup_Date: date, Batch_Total: 0, Item_Count: 0,
      Batch_Entry_Type_ID: this.cfg.mp.batchEntryTypeId,
    };
    if (this.cfg.mp.batchTypeId) rec.Batch_Type_ID = this.cfg.mp.batchTypeId;
    if (this.cfg.mp.congregationId) rec.Congregation_ID = this.cfg.mp.congregationId;
    const [created] = await this.mp.create('Batches', [rec]);
    return created;
  }
}
