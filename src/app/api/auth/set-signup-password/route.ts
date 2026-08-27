import { NextResponse } from 'next/server';

// Retired. Password is now set atomically inside /api/auth/signup — see the
// commit that closed the account-hijack window this route opened. Any caller
// still hitting this endpoint should send `password` in the signup body instead.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'This endpoint has been removed. Send `password` directly in the /api/auth/signup body.',
    },
    { status: 410 }
  );
}
