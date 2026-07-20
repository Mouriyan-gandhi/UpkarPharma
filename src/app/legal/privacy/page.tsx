import type { Metadata } from 'next';
import { COMPANY, LAST_UPDATED } from '../company';

export const metadata: Metadata = {
  title: `Privacy Policy — ${COMPANY.brand}`,
  description: `Privacy Policy for the ${COMPANY.appName} B2B ordering app.`,
};

const h1 = { fontSize: 26, fontWeight: 800, marginBottom: 4, color: '#0B2618' } as const;
const h2 = { fontSize: 18, fontWeight: 800, marginTop: 28, marginBottom: 8, color: '#1B4332' } as const;
const p = { marginBottom: 12 } as const;
const li = { marginBottom: 6 } as const;

export default function PrivacyPolicy() {
  return (
    <article>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={{ color: '#64748b', fontSize: 13 }}>Last updated: {LAST_UPDATED}</p>

      <p style={{ ...p, marginTop: 20 }}>
        This Privacy Policy explains how {COMPANY.legalName} (&ldquo;{COMPANY.brand}&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and protects information when you
        use the {COMPANY.appName} mobile application and related services
        (the &ldquo;App&rdquo;). The App is a <strong>private business-to-business (B2B)
        ordering tool for licensed medical stores and pharmacies</strong> that purchase from us.
        It is not a consumer pharmacy and does not sell medicines to the general public.
      </p>

      <h2 style={h2}>1. Information we collect</h2>
      <p style={p}>We collect only the information needed to operate a wholesale ordering account:</p>
      <ul>
        <li style={li}><strong>Account &amp; business details:</strong> store/business name, contact person, mobile number, email, business address, district/zone, and business type.</li>
        <li style={li}><strong>Regulatory identifiers:</strong> Drug License number, GST number, and registration number — required to verify you are a licensed buyer.</li>
        <li style={li}><strong>Order &amp; account data:</strong> products ordered, quantities, order history, invoices, and credit/outstanding balance.</li>
        <li style={li}><strong>Authentication data:</strong> a hashed password and login session identifiers, including basic device/platform information used for session security.</li>
        <li style={li}><strong>Push notification token:</strong> a device token (via Apple/Google push services) so we can send order-status updates.</li>
      </ul>
      <p style={p}>We do <strong>not</strong> collect precise location, contacts, photos, or advertising identifiers.</p>

      <h2 style={h2}>2. How we use information</h2>
      <ul>
        <li style={li}>To create and approve your account and verify your license to purchase.</li>
        <li style={li}>To process orders, generate GST invoices, and track credit and payments.</li>
        <li style={li}>To send order updates and account notifications (in-app, push, and, where enabled, SMS/WhatsApp).</li>
        <li style={li}>To secure accounts, prevent fraud or misuse, and comply with legal and tax obligations.</li>
      </ul>

      <h2 style={h2}>3. Legal basis &amp; consent</h2>
      <p style={p}>
        We process data to perform our contract with you (supplying goods on a credit/B2B
        basis), to meet legal obligations (tax, drug-distribution records), and with your
        consent for notifications. You may withdraw notification consent in your device settings.
      </p>

      <h2 style={h2}>4. Sharing &amp; third parties</h2>
      <p style={p}>We do not sell your data. We share limited data only with service providers that help us run the App:</p>
      <ul>
        <li style={li}><strong>Push notifications:</strong> Apple Push Notification service and Google Firebase Cloud Messaging (and the Expo push relay) to deliver alerts.</li>
        <li style={li}><strong>SMS / WhatsApp (where enabled):</strong> a messaging provider to send OTPs and order/payment reminders.</li>
        <li style={li}><strong>Hosting:</strong> our application and database are hosted on a secured server we control.</li>
      </ul>
      <p style={p}>We may also disclose information where required by law or to enforce our Terms.</p>

      <h2 style={h2}>5. Data retention</h2>
      <p style={p}>
        We retain account, order, and invoice records for as long as your account is active and
        thereafter only as required by Indian tax and drug-distribution law. When you request
        deletion (see Section 8), we remove personal account data except records we are legally
        required to keep (e.g. tax invoices), which are retained for the statutory period and then deleted.
      </p>

      <h2 style={h2}>6. Security</h2>
      <p style={p}>
        Passwords are stored hashed, sessions are token-based, and all data is transmitted over
        encrypted HTTPS connections. Access to the admin system is restricted and authenticated.
        No method of transmission or storage is perfectly secure, but we take reasonable measures
        to protect your information.
      </p>

      <h2 style={h2}>7. Children</h2>
      <p style={p}>The App is intended for registered businesses and is not directed to anyone under 18.</p>

      <h2 style={h2}>8. Your rights &amp; data deletion</h2>
      <p style={p}>
        You may request access to, correction of, or deletion of your data at any time. To delete
        your account and associated personal data, follow the steps on our{' '}
        <a href="/legal/data-deletion" style={{ color: '#2D6A4F' }}>Data Deletion</a> page or email
        us at <a href={`mailto:${COMPANY.email}`} style={{ color: '#2D6A4F' }}>{COMPANY.email}</a>.
      </p>

      <h2 style={h2}>9. Changes to this policy</h2>
      <p style={p}>We may update this policy; material changes will be posted here with a revised date.</p>

      <h2 style={h2}>10. Contact us</h2>
      <p style={p}>
        {COMPANY.legalName}<br />
        {COMPANY.address}<br />
        Email: <a href={`mailto:${COMPANY.email}`} style={{ color: '#2D6A4F' }}>{COMPANY.email}</a><br />
        Phone: {COMPANY.phone}
      </p>
    </article>
  );
}
