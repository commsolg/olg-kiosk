// All settings come from environment variables (see .env.example).
// Nothing secret is ever sent to the browser.

const list = (v, d = '') => (v ?? d).split(',').map(s => s.trim()).filter(Boolean);
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));

export function readConfig(env = process.env) {
  const cfg = {
    port: int(env.PORT, 3000),
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
    demoMode: bool(env.DEMO_MODE),
    appSecret: env.APP_SECRET || '',
    allowedOrigins: list(env.ALLOWED_ORIGINS, 'http://localhost:3000'),
    timezone: env.PARISH_TIMEZONE || 'America/Chicago',

    mp: {
      baseUrl: (env.MP_BASE_URL || 'https://mp.olghelotes.org').replace(/\/$/, ''),
      clientId: env.MP_CLIENT_ID || '',
      clientSecret: env.MP_CLIENT_SECRET || '',
      // Campaigns the widget may be used for, e.g. "8" (Building Faith Together II)
      allowedCampaignIds: list(env.MP_ALLOWED_CAMPAIGN_IDS, '8').map(Number),
      // Program each campaign's gifts are posted to: "8:60" = campaign 8 -> Program 60
      campaignPrograms: Object.fromEntries(
        list(env.MP_CAMPAIGN_PROGRAMS, '8:60').map(p => p.split(':').map(Number))
      ),
      defaultDonorId: int(env.MP_DEFAULT_DONOR_ID, null),
      congregationId: int(env.MP_CONGREGATION_ID, null),
      paymentTypeName: env.MP_PAYMENT_TYPE_NAME || 'Square',
      paymentTypeId: int(env.MP_PAYMENT_TYPE_ID, null),
      batchEntryTypeId: int(env.MP_BATCH_ENTRY_TYPE_ID, null),
      batchTypeId: int(env.MP_BATCH_TYPE_ID, null),
      batchNamePrefix: env.MP_BATCH_NAME_PREFIX || 'Square Online',
      pledgeStatusActiveName: env.MP_PLEDGE_STATUS_ACTIVE || 'Active',
      pledgeStatusPendingName: env.MP_PLEDGE_STATUS_PENDING || 'Pending',
      // true = every online pledge waits for staff review, even when matched
      alwaysPending: bool(env.MP_ALWAYS_PENDING),
      // true = attach the Pledge_ID on the distribution directly (instant);
      // false = leave it for MinistryPlatform's nightly matching routine
      setPledgeOnDistribution: bool(env.MP_SET_PLEDGE_ON_DISTRIBUTION, true),
      // Auto-create records so gifts land under the person's own name (no staff step):
      createDonors: bool(env.MP_CREATE_DONORS, true),     // existing Contact without a donor record -> create Donor
      createContacts: bool(env.MP_CREATE_CONTACTS, true), // nobody matches -> create Contact + Donor
      // Households = registered parishioners at OLG, so the widget does NOT create them by default
      createHouseholds: bool(env.MP_CREATE_HOUSEHOLDS, false),
      statementFrequencyId: int(env.MP_STATEMENT_FREQUENCY_ID, 1),   // 1 = Quarterly
      statementTypeId: int(env.MP_STATEMENT_TYPE_ID, 2),             // 2 = Family
      statementMethodId: int(env.MP_STATEMENT_METHOD_ID, 1),         // 1 = Postal Mail
      statementMethodNoAddressId: int(env.MP_STATEMENT_METHOD_NO_ADDRESS_ID, 2), // 2 = Email/Online
      householdSourceId: int(env.MP_HOUSEHOLD_SOURCE_ID, 19),        // 19 = Website
      householdPositionId: int(env.MP_HOUSEHOLD_POSITION_ID, 1),     // 1 = Head of Household
      contactStatusId: int(env.MP_CONTACT_STATUS_ID, 1),             // 1 = Active
    },

    square: {
      environment: env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      accessToken: env.SQUARE_ACCESS_TOKEN || '',
      locationId: env.SQUARE_LOCATION_ID || '',
      webhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY || '',
      // Must match EXACTLY the URL entered in the Square Developer Console
      webhookUrl: env.SQUARE_WEBHOOK_URL || '',
      apiVersion: env.SQUARE_API_VERSION || '2025-01-23',
      currency: env.SQUARE_CURRENCY || 'USD',
      // false = only post Square payments that came from this widget
      postAllPayments: bool(env.SQUARE_POST_ALL_PAYMENTS),
    },
  };
  cfg.square.baseUrl = cfg.square.environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  return cfg;
}

export function validateConfig(cfg) {
  if (cfg.demoMode) return [];
  const missing = [];
  const need = (ok, name) => { if (!ok) missing.push(name); };
  need(cfg.appSecret.length >= 32, 'APP_SECRET (32+ characters)');
  need(cfg.mp.clientId, 'MP_CLIENT_ID');
  need(cfg.mp.clientSecret, 'MP_CLIENT_SECRET');
  need(cfg.mp.defaultDonorId, 'MP_DEFAULT_DONOR_ID');
  need(cfg.mp.batchEntryTypeId, 'MP_BATCH_ENTRY_TYPE_ID');
  need(cfg.square.accessToken, 'SQUARE_ACCESS_TOKEN');
  need(cfg.square.locationId, 'SQUARE_LOCATION_ID');
  need(cfg.square.webhookSignatureKey, 'SQUARE_WEBHOOK_SIGNATURE_KEY');
  need(cfg.square.webhookUrl, 'SQUARE_WEBHOOK_URL');
  return missing;
}
