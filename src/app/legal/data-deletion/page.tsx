import type { Metadata } from 'next';
import { COMPANY, LAST_UPDATED } from '../company';

export const metadata: Metadata = {
  title: `Account & Data Deletion — ${COMPANY.brand}`,
  description: `How to delete your ${COMPANY.appName} account and associated data.`,
};

const h1 = { fontSize: 26, fontWeight: 800, marginBottom: 4, color: '#0B2618' } as const;
const h2 = { fontSize: 18, fontWeight: 800, marginTop: 28, marginBottom: 8, color: '#1B4332' } as const;
const p = { marginBottom: 12 } as const;
const li = { marginBottom: 6 } as const;

export default function DataDeletion() {
  return (
    <article>
      <h1 style={h1}>Account &amp; Data Deletion</h1>
      <p style={{ color: '#64748b', fontSize: 13 }}>Last updated: {LAST_UPDATED}</p>

      <p style={{ ...p, marginTop: 20 }}>
        You can delete your {COMPANY.appName} account and associated personal data at any time.
        This page explains how, what is deleted, and what we are legally required to keep.
      </p>

      <h2 style={h2}>Delete from within the app</h2>
      <ol>
        <li style={li}>Open the {COMPANY.appName} app and go to <strong>Profile</strong>.</li>
        <li style={li}>Tap <strong>Delete Account</strong>.</li>
        <li style={li}>Confirm the request. Your account is deactivated immediately and personal data is removed within 30 days.</li>
      </ol>

      <h2 style={h2}>Request by email</h2>
      <p style={p}>
        Alternatively, email{' '}
        <a href={`mailto:${COMPANY.email}`} style={{ color: '#2D6A4F' }}>{COMPANY.email}</a>{' '}
        from your registered email or send the request from your registered mobile number, with the
        subject &ldquo;Delete my account&rdquo;. We verify ownership and complete deletion within 30 days.
      </p>

      <h2 style={h2}>What is deleted</h2>
      <ul>
        <li style={li}>Your profile and business details (name, contact, address, district).</li>
        <li style={li}>Your login credentials, sessions, and push-notification token.</li>
        <li style={li}>Your saved cart and account preferences.</li>
      </ul>

      <h2 style={h2}>What we must retain</h2>
      <p style={p}>
        As a pharmaceutical distributor, we are legally required to keep transactional records —
        including GST tax invoices and drug-supply records — for the period mandated by Indian tax
        and drug-distribution law. These records are retained in a restricted system for the
        statutory period and then deleted. They are no longer linked to an active account.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>
        {COMPANY.legalName}<br />
        {COMPANY.address}<br />
        Email: <a href={`mailto:${COMPANY.email}`} style={{ color: '#2D6A4F' }}>{COMPANY.email}</a><br />
        Phone: {COMPANY.phone}
      </p>
    </article>
  );
}
