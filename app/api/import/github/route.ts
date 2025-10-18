import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase-client';
import { sendEvent } from '../../../../lib/inngest/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, projectId, token } = body;

    if (!repoUrl || !projectId) {
      return NextResponse.json({ 
        error: 'Repository URL and project ID are required' 
      }, { status: 400 });
    }

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the auth token
    const authToken = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    
    // Check if projectId is a slug (not a UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      // Look up project by slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
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
      
      // Create ingestion source record
      const { data: source, error: sourceError } = await supabase
        .from('ingestion_sources')
        .insert({
          project_id: resolvedProjectId,
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

      // Trigger preprocessing job
      await sendEvent('ingestion/preprocess-file', {
        sourceId: source.id,
        projectId: resolvedProjectId,
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
    console.error('GitHub import error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'No project ID provided' }, { status: 400 });
    }

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    
    // Check if projectId is a slug (not a UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      // Look up project by slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get GitHub sources for project
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
      .eq('project_id', resolvedProjectId)
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
    console.error('Get GitHub sources error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
