import Link from 'next/link';
import { COMPANY } from './company';

// Public legal section. Not gated by middleware (matcher only covers / and
// /login), so store reviewers and users can reach these without signing in.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#f7faf8', minHeight: '100vh', padding: '32px 16px' }}>
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: '40px 36px',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          color: '#1f2937',
          lineHeight: 1.65,
          fontSize: 15,
        }}
      >
        <div style={{ borderBottom: '2px solid #1B4332', paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: '#2D6A4F' }}>
            {COMPANY.brand}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{COMPANY.legalName}</div>
        </div>

        {children}

        <div
          style={{
            marginTop: 40,
            paddingTop: 16,
            borderTop: '1px solid #e2e8f0',
            fontSize: 13,
            color: '#64748b',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <Link href="/legal/privacy" style={{ color: '#2D6A4F' }}>Privacy Policy</Link>
          <Link href="/legal/terms" style={{ color: '#2D6A4F' }}>Terms of Service</Link>
          <Link href="/legal/data-deletion" style={{ color: '#2D6A4F' }}>Data Deletion</Link>
        </div>
      </div>
    </div>
  );
}
