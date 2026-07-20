import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY } from './company';

export const metadata: Metadata = {
  title: `Legal — ${COMPANY.brand}`,
};

const h1 = { fontSize: 26, fontWeight: 800, marginBottom: 16, color: '#0B2618' } as const;
const item = { display: 'block', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 12, color: '#1B4332', fontWeight: 700, textDecoration: 'none' } as const;

export default function LegalIndex() {
  return (
    <article>
      <h1 style={h1}>Legal &amp; Policies</h1>
      <Link href="/legal/privacy" style={item}>Privacy Policy</Link>
      <Link href="/legal/terms" style={item}>Terms of Service</Link>
      <Link href="/legal/data-deletion" style={item}>Account &amp; Data Deletion</Link>
    </article>
  );
}
