import { NextResponse } from 'next/server';

// OTP is now handled entirely by Firebase Phone Auth on the client side.
// The mobile app uses the Firebase Auth SDK to send and verify the SMS OTP,
// then sends a Firebase ID token to /api/auth/verify for session creation.
// This endpoint is kept as a stub for backwards compatibility.
export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Use Firebase Phone Auth SDK on the client to send OTP.',
  });
}
