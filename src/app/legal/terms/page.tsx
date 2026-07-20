import type { Metadata } from 'next';
import { COMPANY, LAST_UPDATED } from '../company';

export const metadata: Metadata = {
  title: `Terms of Service — ${COMPANY.brand}`,
  description: `Terms of Service for the ${COMPANY.appName} B2B ordering app.`,
};

const h1 = { fontSize: 26, fontWeight: 800, marginBottom: 4, color: '#0B2618' } as const;
const h2 = { fontSize: 18, fontWeight: 800, marginTop: 28, marginBottom: 8, color: '#1B4332' } as const;
const p = { marginBottom: 12 } as const;
const li = { marginBottom: 6 } as const;

export default function TermsOfService() {
  return (
    <article>
      <h1 style={h1}>Terms of Service</h1>
      <p style={{ color: '#64748b', fontSize: 13 }}>Last updated: {LAST_UPDATED}</p>

      <p style={{ ...p, marginTop: 20 }}>
        These Terms govern your use of the {COMPANY.appName} application operated by{' '}
        {COMPANY.legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By registering for or using the
        App you agree to these Terms. The App is a private B2B ordering platform available only to
        licensed medical stores and pharmacies approved by us.
      </p>

      <h2 style={h2}>1. Eligibility &amp; accounts</h2>
      <ul>
        <li style={li}>You must be a licensed pharmacy/medical store and provide valid Drug License and GST details.</li>
        <li style={li}>Accounts require our approval before ordering. We may approve, reject, or revoke access at our discretion.</li>
        <li style={li}>You are responsible for keeping your login credentials confidential and for all activity under your account.</li>
      </ul>

      <h2 style={h2}>2. Orders</h2>
      <ul>
        <li style={li}>A minimum order value of <strong>₹2,500</strong> applies to each order.</li>
        <li style={li}>Placing an order is an offer to purchase; orders are subject to our acceptance, stock availability, and approval.</li>
        <li style={li}>Prices, schemes, and availability shown in the App may change and are confirmed on the GST invoice issued on dispatch.</li>
      </ul>

      <h2 style={h2}>3. Pricing, credit &amp; payment</h2>
      <ul>
        <li style={li}>Orders are supplied on a credit basis subject to your assigned credit limit.</li>
        <li style={li}>Payment is due strictly within <strong>60 days</strong> of the invoice/dispatch date.</li>
        <li style={li}>Overdue amounts may attract interest and/or suspension of further supply, as stated on the invoice.</li>
        <li style={li}>All prices are exclusive of applicable GST, which is charged as shown on the invoice.</li>
      </ul>

      <h2 style={h2}>4. Returns</h2>
      <p style={p}>
        Goods once sold are not taken back except in the case of a genuine batch defect or as
        required by law. Please verify batch number, quantity, and expiry before accepting delivery.
      </p>

      <h2 style={h2}>5. Acceptable use</h2>
      <ul>
        <li style={li}>Use the App only for lawful wholesale procurement for your licensed business.</li>
        <li style={li}>Do not attempt to access other accounts, probe or interfere with our systems, or misuse the service.</li>
        <li style={li}>You must comply with all applicable drug-distribution, tax, and trade laws.</li>
      </ul>

      <h2 style={h2}>6. Intellectual property</h2>
      <p style={p}>
        The App, its content, and branding are owned by us and may not be copied or reused without permission.
      </p>

      <h2 style={h2}>7. Disclaimers &amp; liability</h2>
      <p style={p}>
        The App is provided &ldquo;as is&rdquo;. To the extent permitted by law, we are not liable
        for indirect or consequential losses. Nothing in these Terms limits liability that cannot
        be limited by law. Product information should always be verified against the physical
        packaging and statutory labelling.
      </p>

      <h2 style={h2}>8. Suspension &amp; termination</h2>
      <p style={p}>
        We may suspend or terminate access for breach of these Terms, overdue payment, or loss of
        eligibility. You may stop using the App and request account deletion at any time.
      </p>

      <h2 style={h2}>9. Governing law</h2>
      <p style={p}>
        These Terms are governed by the laws of India and subject to the exclusive jurisdiction of
        the courts of {COMPANY.jurisdiction}.
      </p>

      <h2 style={h2}>10. Contact</h2>
      <p style={p}>
        {COMPANY.legalName}<br />
        {COMPANY.address}<br />
        Email: <a href={`mailto:${COMPANY.email}`} style={{ color: '#2D6A4F' }}>{COMPANY.email}</a><br />
        Phone: {COMPANY.phone}
      </p>
    </article>
  );
}
