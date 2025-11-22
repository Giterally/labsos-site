import { NextRequest, NextResponse } from 'next/server';
import { sendEvent } from '../../../../lib/inngest/client';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, token } = body;

    if (!repoUrl) {
      return NextResponse.json({ 
        error: 'Repository URL is required' 
      }, { status: 400 });
    }

    // Authenticate request (files are user-scoped, no project permission check needed)
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    // Check file count limit (10 files per user)
    const { count: fileCount, error: countError } = await supabaseServer
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

    // Extract repository info
    const urlParts = repoUrl.replace('https://github.com/', '').split('/');
    const owner = urlParts[0];
    const repo = urlParts[1];
    const branch = urlParts[2] || 'main';

    // Test GitHub access (optional token)
    try {
      const testUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LabsOS-Experiment-Builder',
      };

      if (token) {
        headers['Authorization'] = `token ${token}`;
      }

      const response = await fetch(testUrl, { headers });
      
      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ 
            error: 'Repository not found or not accessible' 
          }, { status: 404 });
        } else if (response.status === 401) {
          return NextResponse.json({ 
            error: 'Invalid GitHub token or insufficient permissions' 
          }, { status: 401 });
        } else {
          return NextResponse.json({ 
            error: 'Failed to access GitHub repository' 
          }, { status: response.status });
        }
      }

      const repoData = await response.json();
      
      // Create ingestion source record (user-scoped, no project_id)
      const { data: source, error: sourceError } = await supabase
        .from('ingestion_sources')
        .insert({
          user_id: user.id,
          project_id: null, // Files are user-scoped, shared across all projects
          source_type: 'github',
          source_name: `${owner}/${repo}`,
          source_url: repoUrl,
          metadata: {
            owner,
            repo,
            branch,
            fullName: repoData.full_name,
            description: repoData.description,
            language: repoData.language,
            stars: repoData.stargazers_count,
            forks: repoData.forks_count,
            size: repoData.size,
            defaultBranch: repoData.default_branch,
            hasToken: !!token,
            importedAt: new Date().toISOString(),
            importedBy: user.id,
          },
          created_by: user.id,
        })
        .select()
        .single();

      if (sourceError) {
        console.error('Source creation error:', sourceError);
        return NextResponse.json({ 
          error: 'Failed to create source record' 
        }, { status: 500 });
      }

      // Trigger preprocessing job (user-scoped)
      await sendEvent('ingestion/preprocess-file', {
        sourceId: source.id,
        userId: user.id,
        sourceType: 'github',
        storagePath: `github://${owner}/${repo}/${branch}`,
        metadata: {
          owner,
          repo,
          branch,
          token: token ? '***' : undefined, // Don't store actual token
          repoData: {
            fullName: repoData.full_name,
            description: repoData.description,
            language: repoData.language,
            defaultBranch: repoData.default_branch,
          },
        },
      });

      return NextResponse.json({
        sourceId: source.id,
        repoName: `${owner}/${repo}`,
        branch,
        status: 'imported',
        message: 'GitHub repository imported successfully, processing started',
      });

    } catch (fetchError) {
      console.error('GitHub API error:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to access GitHub repository' 
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
    const { user } = authContext;

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
