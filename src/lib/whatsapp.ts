import db from '@/lib/db';

/**
 * WhatsApp B2B Messaging Engine
 * Supports Twilio WhatsApp API, OpenWA (@open-wa/wa-automate), or Baileys webhooks.
 */

export interface WhatsAppNotification {
  toPhone: string;
  type: 'ORDER_PLACED' | 'ORDER_ACCEPTED' | 'ORDER_SHIPPED' | 'CREDIT_REMINDER_55' | 'CREDIT_DUE_60';
  orderId?: string;
  storeName?: string;
  amount?: number;
  trackingId?: string;
  courierName?: string;
}

export async function sendWhatsAppB2BNotification(payload: WhatsAppNotification) {
  const { toPhone, type, orderId, storeName, amount, trackingId, courierName } = payload;
  
  // Format Indian phone number for WhatsApp (+91 prefix)
  const cleanPhone = toPhone.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  const whatsappId = `${formattedPhone}@c.us`;

  let messageText = '';

  switch (type) {
    case 'ORDER_PLACED':
      messageText = `*UPKEM PHARMA B2B ORDER CONFIRMATION*\n\nDear ${storeName || 'Partner'},\nYour order *#${orderId}* for ₹${amount?.toLocaleString('en-IN')} has been placed successfully.\n\nOur team is verifying inventory. You will receive a dispatch alert shortly.`;
      break;

    case 'ORDER_ACCEPTED':
      messageText = `*ORDER ACCEPTED & PROCESSING*\n\nOrder *#${orderId}* for ${storeName} has been accepted and is being packed.\nView live status: http://localhost:3000`;
      break;

    case 'ORDER_SHIPPED':
      messageText = `*ORDER DISPATCHED*\n\nOrder *#${orderId}* is on its way!\nCourier: *${courierName || 'Upkar Express'}*\nTracking AWB: *${trackingId || 'N/A'}*\n\n📄 Download Official GST Invoice:\nhttp://localhost:3000/api/invoice?id=${orderId}`;
      break;

    case 'CREDIT_REMINDER_55':
      messageText = `*PAYMENT CREDIT REMINDER (55 DAYS)*\n\nDear ${storeName},\nThis is a friendly reminder that your credit payment of ₹${amount?.toLocaleString('en-IN')} is due in 5 days (60-day limit).\n\nPlease make payment to avoid credit hold.`;
      break;

    case 'CREDIT_DUE_60':
      messageText = `*PAYMENT OVERDUE NOTICE (60 DAYS)*\n\nDear ${storeName},\nYour credit balance of ₹${amount?.toLocaleString('en-IN')} has reached the 60-day deadline.\n\nPlease clear your balance to restore order placement privileges.`;
      break;

    default:
      messageText = `UPKEM Pharma Notification for Order #${orderId}`;
  }

  console.log(`[WhatsApp B2B Bot] Sending to ${whatsappId}:`);
  console.log(messageText);

  const openWaUrl = process.env.OPENWA_WEBHOOK_URL;

  if (openWaUrl) {
    try {
      await fetch(openWaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, message: messageText })
      });
      console.log('[WhatsApp B2B Bot] Webhook dispatched successfully.');
    } catch (e) {
      console.warn('[WhatsApp B2B Bot] Webhook warning:', e);
    }
  }

  return { success: true, messageText, whatsappId };
}
