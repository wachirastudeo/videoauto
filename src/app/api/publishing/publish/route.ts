import { NextResponse } from 'next/server';

// No TikTok upload or product-anchor integration is configured. Keep queued
// videos intact until a real publisher can verify a post.
export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'TikTok publishing is not configured. This video remains in the queue; download it and publish manually.',
  }, { status: 501 });
}
