import { NextRequest, NextResponse } from 'next/server';
import { FEATURE_FLAGS } from '@/lib/config';

/**
 * AI Actions Endpoint - Agentic Chat Features
 * 
 * This endpoint is disabled by default. Set ENABLE_AGENTIC_CHAT=true to re-enable.
 * See deprecated/agentic-chat/README.md for re-enablement instructions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  
  // Check feature flag
  if (!FEATURE_FLAGS.ENABLE_AGENTIC_CHAT) {
    // Log for analytics (privacy-safe - don't log full query)
    console.log('Agentic chat attempt blocked:', {
      timestamp: new Date().toISOString(),
      treeId: treeId,
    });
    
    return NextResponse.json(
      {
        error: 'Feature Unavailable',
        message: 'Agentic chat features have been removed. This endpoint is no longer available. Please use the tree editor interface to make modifications.',
        code: 'AGENTIC_CHAT_DISABLED',
      },
      { status: 410 } // 410 Gone - resource permanently removed
    );
  }
  
  // If flag is enabled, original logic would be restored from deprecated files
  // For now, return error since we're keeping this disabled
  // To re-enable: restore files from deprecated/agentic-chat/ and uncomment logic below
  
  return NextResponse.json(
    {
      error: 'Feature Not Implemented',
      message: 'Agentic chat is enabled but implementation needs to be restored from deprecated files. See deprecated/agentic-chat/README.md for instructions.',
      code: 'AGENTIC_CHAT_NOT_RESTORED',
    },
    { status: 501 } // Not Implemented
  );
}
