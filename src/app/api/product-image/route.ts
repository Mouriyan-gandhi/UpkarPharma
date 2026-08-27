import { NextResponse } from 'next/server';

// Product images now flow through Supabase Storage (or inline data-URL upload
// via the admin Edit Product modal). This local-filesystem uploader is retired.
// TODO: replace with a Supabase Storage bucket + signed upload URL flow.
export async function POST() {
  return NextResponse.json(
    { error: 'Product image upload has moved. Use the "Upload from device" button in the admin Edit Product modal, or paste an image URL directly.' },
    { status: 410 }
  );
}
