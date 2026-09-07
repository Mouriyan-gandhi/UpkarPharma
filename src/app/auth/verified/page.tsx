// Landing page after email verification. Two paths land here:
//
//  1. Customer taps the email link on desktop / a browser that isn't
//     handling the upkemlabs:// deep link → they land here.
//  2. Customer taps the link on Android but the APK isn't installed →
//     they land here.
//
// In both cases we just confirm success and nudge them to open the app.
// The actual verification state was flipped by Supabase before this
// page rendered — nothing to do here client-side.

export default function VerifiedPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0B2618',
      color: '#fff',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: 'rgba(82, 183, 136, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
      }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17l-5-5" stroke="#52B788" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
        Email verified
      </h1>
      <p style={{ fontSize: 15, opacity: 0.7, marginTop: 12, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
        You're all set. Open the UPKEM Labs app to continue — the "unverified" tag will clear on the next screen refresh.
      </p>
      <a
        href="upkemlabs://verified"
        style={{
          marginTop: 32,
          backgroundColor: '#52B788',
          color: '#0B2618',
          fontWeight: 900,
          fontSize: 15,
          padding: '14px 28px',
          borderRadius: 12,
          textDecoration: 'none',
          letterSpacing: 0.3,
        }}
      >
        Open UPKEM Labs
      </a>
      <p style={{ fontSize: 11, opacity: 0.4, marginTop: 40, letterSpacing: 1, textTransform: 'uppercase' }}>
        UPKEM Labs · Pharma Distributor Portal
      </p>
    </div>
  );
}
