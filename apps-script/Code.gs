/**
 * Hugs Luxury Apartments — Google Apps Script mailer + subscriber sink.
 *
 * Deploy this as a Web App (Deploy > New deployment > Web app):
 *   - Execute as:            Me
 *   - Who has access:        Anyone
 * Copy the resulting /exec URL into the backend .env as APPS_SCRIPT_URL, and
 * set a matching APPS_SCRIPT_TOKEN in both this script (SHARED_TOKEN below,
 * via Script Properties) and the backend .env.
 *
 * The backend POSTs JSON of the shape:
 *   { action: 'booking_confirmed', token, business, receipt, payment }
 *   { action: 'subscribe',         token, email, name }
 *
 * booking_confirmed  -> emails the guest a branded HTML message with a PDF
 *                       receipt attached, and BCCs the business inbox.
 * subscribe          -> appends the email to a "Subscribers" sheet and sends
 *                       a short welcome email.
 */

// ---- Configuration -------------------------------------------------------
// Prefer Script Properties over hardcoding. In the Apps Script editor:
//   Project Settings > Script properties > add SHARED_TOKEN and (optionally)
//   SUBSCRIBERS_SHEET_ID. Falls back to the constants below if unset.
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    sharedToken: props.getProperty('SHARED_TOKEN') || 'change-me-shared-token',
    subscribersSheetId: props.getProperty('SUBSCRIBERS_SHEET_ID') || '',
    brandPlum: '#3B1445',
    brandGold: '#C9A45C',
  };
}

// ---- Web app entry point -------------------------------------------------
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var cfg = getConfig();

    if (!body.token || body.token !== cfg.sharedToken) {
      return json({ ok: false, error: 'Unauthorized' });
    }

    switch (body.action) {
      case 'booking_confirmed':
        return json(handleBookingConfirmed(body, cfg));
      case 'subscribe':
        return json(handleSubscribe(body, cfg));
      default:
        return json({ ok: false, error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// GET is handy for a quick "is it deployed?" check in the browser.
function doGet() {
  return json({ ok: true, service: 'hugs-mailer' });
}

// ---- Booking confirmation ------------------------------------------------
function handleBookingConfirmed(body, cfg) {
  var receipt = body.receipt || {};
  var payment = body.payment || {};
  var business = body.business || {};
  var guest = receipt.guest || {};

  if (!guest.email) return { ok: false, error: 'Missing guest email' };

  var pdf = buildReceiptPdf(receipt, payment, business, cfg);
  var subject = business.name + ' — Booking confirmed (' + receipt.reference + ')';
  var html = buildEmailHtml(receipt, payment, business, cfg);

  var options = {
    htmlBody: html,
    name: business.name,
    attachments: [pdf],
  };
  if (business.email) options.bcc = business.email;

  MailApp.sendEmail(guest.email, subject, plainText(receipt, payment, business), options);
  return { ok: true };
}

// Builds a PDF receipt by rendering an HTML doc and converting to PDF.
function buildReceiptPdf(receipt, payment, business, cfg) {
  var stay = receipt.stay || {};
  var charges = receipt.charges || {};
  var property = receipt.property || {};
  var currency = charges.currency || 'NGN';

  var html =
    '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Georgia,\'Times New Roman\',serif;color:#211122;margin:40px;}' +
    '.head{border-bottom:3px solid ' + cfg.brandGold + ';padding-bottom:16px;margin-bottom:24px;}' +
    '.brand{color:' + cfg.brandPlum + ';font-size:26px;font-weight:bold;}' +
    '.tag{color:' + cfg.brandGold + ';font-size:12px;letter-spacing:2px;text-transform:uppercase;}' +
    '.ref{margin-top:8px;font-size:13px;color:#555;}' +
    'h2{color:' + cfg.brandPlum + ';font-size:15px;border-bottom:1px solid #eee;padding-bottom:6px;margin-top:28px;}' +
    'table{width:100%;border-collapse:collapse;font-size:13px;}' +
    'td{padding:6px 0;}' +
    '.r{text-align:right;}' +
    '.total{border-top:2px solid ' + cfg.brandPlum + ';font-weight:bold;color:' + cfg.brandPlum + ';font-size:16px;}' +
    '.foot{margin-top:36px;font-size:11px;color:#888;text-align:center;}' +
    '</style></head><body>' +
    '<div class="head"><div class="brand">' + esc(business.name) + '</div>' +
    '<div class="tag">Live Luxury. Feel at Home.</div>' +
    '<div class="ref">Receipt · ' + esc(receipt.reference) + ' · ' + fmtDate(receipt.issued_at) + '</div></div>' +

    '<h2>Guest</h2><table>' +
    row('Name', esc(guest_(receipt).name)) +
    row('Email', esc(guest_(receipt).email)) +
    '</table>' +

    '<h2>Stay</h2><table>' +
    row('Apartment', esc(property.name || '—')) +
    row('Type', esc(property.type || '—')) +
    row('Check-in', fmtDate(stay.check_in)) +
    row('Check-out', fmtDate(stay.check_out)) +
    row('Nights', String(stay.nights || '')) +
    row('Guests', String(stay.guests || '')) +
    '</table>' +

    '<h2>Payment</h2><table>' +
    trow('Subtotal', money(charges.subtotal, currency)) +
    trow('Service fee', money(charges.service_fee, currency)) +
    '<tr class="total"><td>Total paid</td><td class="r">' + money(charges.total, currency) + '</td></tr>' +
    '</table>' +
    '<table style="margin-top:10px;">' +
    row('Payment ref', esc(payment.reference || '—')) +
    row('Provider', esc(payment.provider || '—')) +
    row('Paid at', fmtDate(payment.paid_at)) +
    '</table>' +

    '<div class="foot">Thank you for staying with ' + esc(business.name) + '. ' +
    'Questions? ' + esc(business.email || '') + ' · ' + esc(business.whatsapp || '') + '</div>' +
    '</body></html>';

  var blob = Utilities.newBlob(html, 'text/html', 'receipt.html');
  return blob.getAs('application/pdf').setName('Hugs-Receipt-' + receipt.reference + '.pdf');
}

function buildEmailHtml(receipt, payment, business, cfg) {
  var charges = receipt.charges || {};
  var stay = receipt.stay || {};
  var property = receipt.property || {};
  var currency = charges.currency || 'NGN';
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#211122;">' +
    '<div style="background:' + cfg.brandPlum + ';padding:28px 24px;border-radius:12px 12px 0 0;">' +
    '<div style="color:#fff;font-size:22px;font-weight:bold;">' + esc(business.name) + '</div>' +
    '<div style="color:' + cfg.brandGold + ';font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Live Luxury. Feel at Home.</div>' +
    '</div>' +
    '<div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px;">' +
    '<h2 style="color:' + cfg.brandPlum + ';margin:0 0 4px;">Your booking is confirmed</h2>' +
    '<p style="color:#555;font-size:14px;">Hi ' + esc(guest_(receipt).name) + ', thank you for booking with us. ' +
    'Your payment was received and your stay is confirmed. Your receipt is attached as a PDF.</p>' +
    '<div style="background:' + cfg.brandGold + ';color:' + cfg.brandPlum + ';display:inline-block;padding:8px 16px;border-radius:999px;font-weight:bold;font-size:13px;">Ref: ' + esc(receipt.reference) + '</div>' +
    '<table style="width:100%;font-size:14px;margin-top:20px;border-collapse:collapse;">' +
    mrow('Apartment', esc(property.name || '—')) +
    mrow('Check-in', fmtDate(stay.check_in)) +
    mrow('Check-out', fmtDate(stay.check_out)) +
    mrow('Guests', String(stay.guests || '')) +
    mrow('Total paid', money(charges.total, currency)) +
    '</table>' +
    '<p style="color:#888;font-size:12px;margin-top:24px;">Need help? Reply to this email, or reach us at ' +
    esc(business.email || '') + ' / ' + esc(business.whatsapp || '') + '.</p>' +
    '</div></div>';
}

// ---- Subscribe -----------------------------------------------------------
function handleSubscribe(body, cfg) {
  var email = (body.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') === -1) return { ok: false, error: 'Invalid email' };

  if (cfg.subscribersSheetId) {
    var sheet = SpreadsheetApp.openById(cfg.subscribersSheetId).getSheets()[0];
    sheet.appendRow([new Date(), email, body.name || '']);
  }

  // Welcome email (best-effort).
  try {
    MailApp.sendEmail(email, 'Welcome to Hugs Luxury Apartments', 'Thanks for subscribing!', {
      htmlBody:
        '<div style="font-family:Arial,sans-serif;color:#211122;">' +
        '<h2 style="color:' + cfg.brandPlum + ';">Welcome</h2>' +
        '<p>Thanks for subscribing to Hugs Luxury Apartments. ' +
        'You\'ll be first to hear about new apartments and special offers.</p>' +
        '<p style="color:' + cfg.brandGold + ';font-weight:bold;">Live Luxury. Feel at Home.</p></div>',
      name: 'Hugs Luxury Apartments',
    });
  } catch (err) {
    // Non-fatal — the address is still recorded.
  }
  return { ok: true };
}

// ---- Helpers -------------------------------------------------------------
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
function guest_(receipt) { return receipt.guest || {}; }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function row(label, value) {
  return '<tr><td style="color:#777;">' + label + '</td><td class="r">' + value + '</td></tr>';
}
function trow(label, value) {
  return '<tr><td>' + label + '</td><td class="r">' + value + '</td></tr>';
}
function mrow(label, value) {
  return '<tr><td style="padding:6px 0;color:#777;">' + label +
    '</td><td style="padding:6px 0;text-align:right;font-weight:bold;">' + value + '</td></tr>';
}
function money(amount, currency) {
  var n = Number(amount || 0);
  var s = n.toLocaleString('en-NG');
  return (currency === 'NGN' ? '₦' : (currency + ' ')) + s;
}
function fmtDate(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMM yyyy');
}
function plainText(receipt, payment, business) {
  var c = receipt.charges || {};
  return business.name + ' — Booking confirmed\n' +
    'Reference: ' + receipt.reference + '\n' +
    'Total paid: ' + money(c.total, c.currency || 'NGN') + '\n' +
    'Your PDF receipt is attached.';
}
