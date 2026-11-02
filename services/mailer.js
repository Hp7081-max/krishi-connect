// Sends OTP emails through Brevo's HTTPS API (works on Render free plan; SMTP ports are blocked there).
// Needs env vars: BREVO_API_KEY and MAIL_FROM (a sender verified in Brevo).

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const PURPOSE_TEXT = {
  register: 'account banane (registration)',
  login: 'login',
  reset: 'password reset'
};

function isConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
}

async function sendOtpEmail(to, code, purpose) {
  const what = PURPOSE_TEXT[purpose] || 'verification';

  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email service is not configured on the server (BREVO_API_KEY / MAIL_FROM missing).');
    }
    // Local development only: show OTP in the server console instead of emailing it.
    console.log(`[DEV OTP] ${purpose} OTP for ${to}: ${code}`);
    return { dev: true };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;border:1px solid #e3e8e3;border-radius:12px">
      <h2 style="color:#1f6b3a;margin:0 0 8px">🌾 Krishi Connect</h2>
      <p style="margin:0 0 14px;color:#333">${what} ke liye aapka OTP:</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#111;background:#f3f8f3;padding:14px;text-align:center;border-radius:8px">${code}</div>
      <p style="color:#555;font-size:13px;margin-top:14px">Ye OTP 5 minute tak valid hai. Ise kisi ko na batayein. Agar ye aapne nahi manga, to is email ko ignore karein.</p>
    </div>`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000); // 10 sec se zyada nahi rukega
  let res;
  try {
  res = await fetch(BREVO_URL, {
    signal: ctrl.signal,
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'Krishi Connect', email: process.env.MAIL_FROM },
      to: [{ email: to }],
      subject: `Krishi Connect OTP: ${code}`,
      htmlContent: html,
      textContent: `Krishi Connect OTP: ${code}. Ye 5 minute tak valid hai. Kisi ko na batayein.`
    })
  });
  } catch (e) {
    console.error('Brevo request failed:', e.message);
    throw new Error('Email bhejne me dikkat aayi. Thodi der baad dobara try karein.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch (e) {}
    console.error('Brevo send failed:', res.status, detail);
    throw new Error('Email bhejne me dikkat aayi. Thodi der baad dobara try karein.');
  }
  return { dev: false };
}

module.exports = { sendOtpEmail, isConfigured };
