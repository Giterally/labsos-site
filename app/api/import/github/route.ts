import { NextRequest, NextResponse } from 'next/server';
import { sendEvent } from '../../../../lib/inngest/client';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, token } = body;
    
    // For now, only support public repositories (no token)
    // If a token is provided, ignore it and proceed without authentication
    // This ensures we only access public repos

    if (!repoUrl) {
      return NextResponse.json({ 
        error: 'Repository URL is required' 
      }, { status: 400 });
    }

    // Authenticate request (files are user-scoped, no project permission check needed)
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;

    // Check file count limit (10 files per user)
    const { count: fileCount, error: countError } = await supabase
      .from('ingestion_sources')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('Error counting files:', countError);
      return NextResponse.json({ 
        error: 'Failed to check file limit' 
      }, { status: 500 });
    }

    const MAX_FILES_PER_USER = 7;
    if ((fileCount || 0) >= MAX_FILES_PER_USER) {
      return NextResponse.json({ 
        error: `You have reached the maximum limit of ${MAX_FILES_PER_USER} uploaded files. Please delete some files before importing new ones.` 
      }, { status: 400 });
    }

    // Validate GitHub URL
    const githubUrlPattern = /^https:\/\/github\.com\/[^\/]+\/[^\/]+(?:\/.*)?$/;
    if (!githubUrlPattern.test(repoUrl)) {
      return NextResponse.json({ 
        error: 'Invalid GitHub repository URL' 
      }, { status: 400 });
    }

    // Extract repository info - handle URLs with paths after repo name
    const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      return NextResponse.json({ 
        error: 'Invalid GitHub repository URL format' 
      }, { status: 400 });
    }
    
    const owner = urlMatch[1];
    const repo = urlMatch[2];
    // Extract branch from URL if present, otherwise default to 'main'
    const branchMatch = repoUrl.match(/\/tree\/([^\/]+)/);
    const branch = branchMatch ? branchMatch[1] : 'main';

    // Test GitHub access (optional token)
    try {
      const testUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LabsOS-Experiment-Builder',
      };

      // Only access public repositories (no token)
      // Private repositories are not supported at this time

      const response = await fetch(testUrl, { headers });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorMessage = 'Failed to access GitHub repository';
        
        // Log the actual request for debugging
        console.log('[GitHub Import] API Request:', {
          url: testUrl,
          owner,
          repo,
          publicOnly: true,
        });
        
        if (response.status === 404) {
          errorMessage = `Repository "${owner}/${repo}" not found or is private. Only public repositories are supported. Please ensure the repository is public and the URL is correct (case-sensitive).`;
        } else if (response.status === 401) {
          // Provide more detailed error information
          let detailedMessage = 'Invalid GitHub token or insufficient permissions.';
          try {
            const errorDetails = JSON.parse(errorText);
            if (errorDetails?.message) {
              detailedMessage += ` GitHub says: "${errorDetails.message}"`;
            }
          } catch {
            // If errorText isn't JSON, use it as-is
            if (errorText && errorText !== 'Unknown error') {
              detailedMessage += ` ${errorText}`;
            }
          }
          
          errorMessage = `${detailedMessage} Only public repositories are supported. Please ensure the repository is public.`;
        } else if (response.status === 403) {
          errorMessage = 'GitHub API rate limit exceeded or access forbidden. If this is a public repo, try again in a few minutes. Only public repositories are supported.';
        } else if (response.status === 429) {
          errorMessage = 'GitHub API rate limit exceeded. Please try again in a few minutes.';
        } else {
          errorMessage = `Failed to access GitHub repository (HTTP ${response.status}). ${errorText}`;
        }
        
        console.error('GitHub API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url: testUrl,
          publicOnly: true
        });
        
        return NextResponse.json({ 
          error: errorMessage 
        }, { status: response.status });
      }

      const repoData = await response.json();
      
      // Create ingestion source record (user-scoped, no project_id)
      // Handle null values from GitHub API
      const storagePath = `github://${owner}/${repo}/${branch}`;
      const insertData = {
        user_id: user.id,
        project_id: null, // Files are user-scoped, shared across all projects
        source_type: 'github',
        source_name: `${owner}/${repo}`,
        source_url: repoUrl,
        storage_path: storagePath, // Required for preprocessing pipeline
        status: 'uploaded' as const, // Explicitly set status
        metadata: {
          owner,
          repo,
          branch,
          fullName: repoData.full_name || null,
          description: repoData.description || null,
          language: repoData.language || null,
          stars: repoData.stargazers_count ?? 0,
          forks: repoData.forks_count ?? 0,
          size: repoData.size ?? 0,
          defaultBranch: repoData.default_branch || 'main',
          hasToken: false, // Public repos only
          importedAt: new Date().toISOString(),
          importedBy: user.id,
        },
        created_by: user.id,
      };

      console.log('[GitHub Import] Inserting source record:', {
        user_id: user.id,
        source_name: `${owner}/${repo}`,
        source_type: 'github',
        hasMetadata: !!insertData.metadata,
      });

      // Use supabaseServer (service role) for insert to bypass RLS, consistent with upload route
      const { data: source, error: sourceError } = await supabaseServer
        .from('ingestion_sources')
        .insert(insertData)
        .select()
        .single();

      if (sourceError) {
        console.error('[GitHub Import] Source creation error:', {
          error: sourceError,
          code: sourceError.code,
          message: sourceError.message,
          details: sourceError.details,
          hint: sourceError.hint,
          insertData: {
            user_id: insertData.user_id,
            source_type: insertData.source_type,
            source_name: insertData.source_name,
            hasMetadata: !!insertData.metadata,
          },
        });
        
        // Provide more specific error message
        let errorMessage = 'Failed to create source record';
        if (sourceError.code === '23503') {
          errorMessage = 'Database constraint violation. Please ensure you are properly authenticated.';
        } else if (sourceError.code === '23505') {
          errorMessage = 'This repository has already been imported.';
        } else if (sourceError.message) {
          errorMessage = `Failed to create source record: ${sourceError.message}`;
        }
        
        return NextResponse.json({ 
          error: errorMessage,
          details: process.env.NODE_ENV === 'development' ? sourceError.message : undefined
        }, { status: 500 });
      }

      // Trigger preprocessing job (user-scoped)
      // Use the same fallback pattern as other import routes
      const isLocalDev = process.env.NODE_ENV === 'development' && !process.env.INNGEST_EVENT_KEY;
      
      if (isLocalDev) {
        // Use preprocessing pipeline directly in development
        const { preprocessFile } = await import('@/lib/processing/preprocessing-pipeline');
        preprocessFile(source.id, user.id)
          .catch((error) => {
            console.error('[GitHub Import] Preprocessing error:', error);
          });
        console.log('[GitHub Import] Using preprocessing pipeline for development');
      } else {
        // Use Inngest in production, with fallback to direct preprocessing
        try {
          await sendEvent('ingestion/preprocess-file', {
            sourceId: source.id,
            userId: user.id,
            sourceType: 'github',
            storagePath: storagePath,
            metadata: {
              owner,
              repo,
              branch,
              // No token - public repos only
              repoData: {
                fullName: repoData.full_name,
                description: repoData.description,
                language: repoData.language,
                defaultBranch: repoData.default_branch,
              },
            },
          });
          console.log('[GitHub Import] Inngest event sent successfully for source:', source.id);
        } catch (eventError) {
          console.error('[GitHub Import] Failed to send Inngest event:', eventError);
          console.log('[GitHub Import] Inngest failed, falling back to preprocessing pipeline');
          
          // Fallback to preprocessing if Inngest fails
          try {
            const { preprocessFile } = await import('@/lib/processing/preprocessing-pipeline');
            preprocessFile(source.id, user.id)
              .catch((preprocessingError) => {
                console.error('[GitHub Import] Fallback preprocessing failed:', preprocessingError);
              });
            console.log('[GitHub Import] Fallback preprocessing started');
          } catch (preprocessingError) {
            console.error('[GitHub Import] Failed to start fallback preprocessing:', preprocessingError);
            // Don't throw - we still want to mark the repo as imported
          }
        }
      }

      return NextResponse.json({
        sourceId: source.id,
        repoName: `${owner}/${repo}`,
        branch,
        status: 'imported',
        message: 'GitHub repository imported successfully, processing started',
      });

    } catch (fetchError) {
      console.error('GitHub API error:', fetchError);
      
      let errorMessage = 'Failed to access GitHub repository';
      if (fetchError instanceof Error) {
        if (fetchError.message.includes('fetch')) {
          errorMessage = 'Network error: Unable to connect to GitHub API. Please check your internet connection and try again.';
        } else if (fetchError.message.includes('timeout')) {
          errorMessage = 'Request timeout: GitHub API took too long to respond. Please try again.';
        } else {
          errorMessage = `Failed to access GitHub repository: ${fetchError.message}`;
        }
      }
      
      return NextResponse.json({ 
        error: errorMessage 
      }, { status: 500 });
    }

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('GitHub import error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate request (files are user-scoped)
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;

    // Get GitHub sources for user (all user's GitHub imports across all projects)
    const { data: sources, error } = await supabase
      .from('ingestion_sources')
      .select(`
        id,
        source_name,
        source_url,
        status,
        error_message,
        metadata,
        created_at,
        updated_at
      `)
      .eq('user_id', user.id)
      .eq('source_type', 'github')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching GitHub sources:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch GitHub sources' 
      }, { status: 500 });
    }

    return NextResponse.json({ sources });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Get GitHub sources error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
