import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Get the token from query parameter (EventSource doesn't support custom headers)
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create a mock request with the token for PermissionService
    const mockRequest = new Request(request.url, {
      method: 'GET',
      headers: {
        'authorization': `Bearer ${token}`
      }
    });

    // Use PermissionService for project access check
    const permissionService = new PermissionService(supabaseServer, user.id);
    const access = await permissionService.checkProjectAccess(projectId);
    
    if (!access.canRead) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get the resolved project ID from the permission service
    const resolvedProjectId = access.projectId;

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to status updates' })}\n\n`));

        // Set up Supabase real-time subscription
        const channel = supabaseServer
          .channel(`project-${resolvedProjectId}-status`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'ingestion_sources',
              filter: `project_id=eq.${resolvedProjectId}`,
            },
            (payload) => {
              console.log('Status update received:', payload);
              const data = {
                type: 'status_update',
                sourceId: payload.new.id,
                status: payload.new.status,
                sourceName: payload.new.source_name,
                updatedAt: payload.new.updated_at,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'jobs',
              filter: `project_id=eq.${resolvedProjectId}`,
            },
            (payload) => {
              // Only broadcast if progress fields were updated
              if (payload.new.progress_updated_at !== payload.old.progress_updated_at) {
                console.log('Progress update received:', payload);
                const data = {
                  type: 'progress_update',
                  jobId: payload.new.id,
                  progress: {
                    stage: payload.new.progress_stage,
                    current: payload.new.progress_current,
                    total: payload.new.progress_total,
                    message: payload.new.progress_message,
                    timestamp: new Date(payload.new.progress_updated_at).getTime(),
                  },
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'proposed_nodes',
              filter: `project_id=eq.${resolvedProjectId}`,
            },
            (payload) => {
              console.log('New proposal received:', payload);
              const data = {
                type: 'new_proposal',
                proposalId: payload.new.id,
                status: payload.new.status,
                confidence: payload.new.confidence,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'proposed_nodes',
              filter: `project_id=eq.${resolvedProjectId}`,
            },
            (payload) => {
              console.log('Proposal update received:', payload);
              const data = {
                type: 'proposal_update',
                proposalId: payload.new.id,
                status: payload.new.status,
                confidence: payload.new.confidence,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'proposed_nodes',
              filter: `project_id=eq.${resolvedProjectId}`,
            },
            (payload) => {
              console.log('Proposal deleted:', payload);
              const data = {
                type: 'proposal_deleted',
                proposalId: payload.old.id,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            }
          )
          .subscribe((status) => {
            console.log('Subscription status:', status);
            if (status === 'SUBSCRIBED') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'subscribed', message: 'Subscribed to real-time updates' })}\n\n`));
            }
          });

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          console.log('Client disconnected, cleaning up subscription');
          supabaseServer.removeChannel(channel);
          controller.close();
        });

        // Keep connection alive with periodic heartbeat
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`));
          } catch (error) {
            console.log('Heartbeat failed, connection closed');
            clearInterval(heartbeat);
            supabaseServer.removeChannel(channel);
          }
        }, 30000); // Send heartbeat every 30 seconds

        // Clean up on stream close
        const cleanup = () => {
          clearInterval(heartbeat);
          supabaseServer.removeChannel(channel);
        };

        // Handle stream close
        const originalClose = controller.close.bind(controller);
        controller.close = () => {
          cleanup();
          originalClose();
        };
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('SSE endpoint error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
