/**
 * SMS OTP delivery. Supports MSG91 (India's leading B2B SMS provider).
 * Set SMS_PROVIDER=msg91 and MSG91_AUTH_KEY + MSG91_TEMPLATE_ID in env.
 * In dev (no env vars), OTP is logged to the server console.
 */

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const provider = process.env.SMS_PROVIDER || 'console';

  if (provider === 'msg91') {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    if (!authKey || !templateId) {
      throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required when SMS_PROVIDER=msg91');
    }

    // MSG91 OTP API v5
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${phone}`,
        otp,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MSG91 error: ${text}`);
    }
    return;
  }

  // Dev fallback — log OTP to server console
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📱 [DEV OTP] Phone: ${phone}`);
  console.log(`🔑 [DEV OTP] Code:  ${otp}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
