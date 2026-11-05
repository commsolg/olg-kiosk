// In-memory stand-ins for MinistryPlatform and Square, used when DEMO_MODE=1
// (and by the tests). Lets anyone try the widget with no credentials.

let seq = 1000;
const nextId = () => ++seq;

/** Parses the small subset of MP $filter syntax this app uses. */
function matches(row, filter) {
  if (!filter) return true;
  return filter.split(/\s+AND\s+/i).every(cond => {
    let m;
    if ((m = cond.match(/^(\w+(?:\.\w+)?)\s*=\s*'((?:[^']|'')*)'$/))) return String(row[m[1]] ?? '').toLowerCase() === m[2].replace(/''/g, "'").toLowerCase();
    if ((m = cond.match(/^(\w+(?:\.\w+)?)\s*=\s*(-?\d+)$/))) return Number(row[m[1]]) === Number(m[2]);
    if ((m = cond.match(/^(\w+)\s+IN\s*\(([\d,\s]+)\)$/i))) return m[2].split(',').map(Number).includes(Number(row[m[1]]));
    if ((m = cond.match(/^(\w+)\s+LIKE\s+'(.*)'$/i))) {
      const re = new RegExp(`^${m[2].replace(/''/g, "'").replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
      return re.test(String(row[m[1]] ?? ''));
    }
    if ((m = cond.match(/^(\w+)\.(\w+)\s*>=\s*'(.*)'$/))) return true; // joined-table date filters: accept in demo
    throw new Error(`demo MP: unsupported filter "${cond}"`);
  });
}

export class FakeMinistryPlatform {
  constructor(seed = {}) {
    const keys = { Pledges: 'Pledge_ID', Donations: 'Donation_ID', Donation_Distributions: 'Donation_Distribution_ID', Batches: 'Batch_ID', Contacts: 'Contact_ID', Donors: 'Donor_ID', Households: 'Household_ID', Addresses: 'Address_ID' };
    this.keys = keys;
    this.tables = {
      Pledge_Statuses: [
        { Pledge_Status_ID: 1, Pledge_Status: 'Active' },
        { Pledge_Status_ID: 2, Pledge_Status: 'Completed' },
        { Pledge_Status_ID: 3, Pledge_Status: 'Discontinued' },
        { Pledge_Status_ID: 4, Pledge_Status: 'Pending' },
      ],
      Payment_Types: [{ Payment_Type_ID: 1, Payment_Type: 'Check' }, { Payment_Type_ID: 7, Payment_Type: 'Square - Credit Card' }],
      Pledge_Campaigns: [{
        Pledge_Campaign_ID: 8, Campaign_Name: 'Building Faith Together II',
        Description: 'Help us retire the Family Center debt and build for the next generation.',
        Campaign_Goal: 594000, Start_Date: '2026-10-27T10:02:00', End_Date: '2027-10-31T00:00:00',
        Allow_Online_Pledge: true, Online_Thank_You_Message: 'Thank you, [display_name], for building faith together!',
      }],
      Contacts: [{ Contact_ID: 501, First_Name: 'Maria', Nickname: 'Maria', Last_Name: 'Garcia', Email_Address: 'maria@example.com', Donor_Record: 9001 }],
      Pledges: [
        { Pledge_ID: 1, Donor_ID: 8000, Pledge_Campaign_ID: 8, Pledge_Status_ID: 1, Total_Pledge: 182500 },
        { Pledge_ID: 2, Donor_ID: 8001, Pledge_Campaign_ID: 8, Pledge_Status_ID: 1, Total_Pledge: 61000 },
      ],
      Donations: [],
      Donation_Distributions: [{ Donation_Distribution_ID: 1, Program_ID: 60, Amount: 48750 }],
      Batches: [],
      ...seed,
    };
    this.calls = [];
  }
  async get(table, { filter, top } = {}) {
    this.calls.push(['get', table, filter]);
    const rows = (this.tables[table] || []).filter(r => matches(r, filter));
    return structuredClone(top ? rows.slice(0, top) : rows);
  }
  async getAll(table, opts) { return this.get(table, opts); }
  async create(table, records) {
    this.calls.push(['create', table, records]);
    const key = this.keys[table];
    const out = records.map(r => ({ [key]: nextId(), ...r }));
    (this.tables[table] ||= []).push(...out);
    return structuredClone(out);
  }
  async update(table, records) {
    this.calls.push(['update', table, records]);
    const key = this.keys[table];
    return records.map(r => Object.assign(this.tables[table].find(x => x[key] === r[key]), r));
  }
}

export class FakeSquare {
  constructor(publicUrl = 'http://localhost:3000') { this.publicUrl = publicUrl; this.orders = new Map(); this.links = []; }
  async createPledgePaymentLink(args) {
    if (this.failAll) throw new Error('Square POST /v2/online-checkout/payment-links failed (503) SERVICE_UNAVAILABLE');
    if (args.prefillEmail !== false && /@example\.com$/i.test(args.buyerEmail || '')) throw new Error('Square POST /v2/online-checkout/payment-links failed (400) INVALID_EMAIL_ADDRESS: Invalid email address.');
    const orderId = `demo-order-${nextId()}`;
    this.orders.set(orderId, {
      id: orderId,
      metadata: { mp_pledge_id: String(args.pledgeId), mp_donor_id: String(args.donorId ?? ''), mp_contact_id: String(args.contactId ?? ''), mp_campaign_id: String(args.campaignId), donor_name: args.donorName || '', donor_email: args.buyerEmail || '', source: 'olg-pledge-widget' },
      amountCents: args.amountCents, redirectUrl: args.redirectUrl, buyerEmail: args.buyerEmail, itemName: args.itemName,
    });
    this.links.push(args);
    return { url: `${this.publicUrl}/demo/checkout/${orderId}`, orderId, id: orderId };
  }
  async getOrder(id) { return this.orders.get(id) || null; }
}
