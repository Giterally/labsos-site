import { supabaseServer } from '../../supabase-server';

export interface PreprocessedContent {
  text?: string;
  tables?: string[][][];
  code?: string;
  needsTranscription?: boolean;
  metadata?: any;
}

// Preprocess GitHub repository - extracts README file
export async function preprocessGitHub(
  repoUrl: string,
  metadata: any
): Promise<PreprocessedContent> {
  try {
    // Extract owner and repo from URL
    const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL');
    }
    
    const owner = urlMatch[1];
    const repo = urlMatch[2];
    const branch = metadata?.branch || metadata?.defaultBranch || 'main';
    const token = metadata?.token; // Note: token is stored as '***' in metadata, so we can't use it here
    
    console.log(`[GitHub Preprocessor] Fetching README for ${owner}/${repo} (branch: ${branch})`);
    
    // Try to fetch README.md (try common variations)
    const readmeVariations = ['README.md', 'README.MD', 'readme.md', 'README.txt', 'README'];
    let readmeContent = '';
    let readmePath = '';
    
    for (const readmeFile of readmeVariations) {
      try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${readmeFile}?ref=${branch}`;
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LabsOS-Experiment-Builder',
        };
        
        // Note: We can't use token from metadata since it's stored as '***'
        // For public repos, this should work without a token
        
        const response = await fetch(apiUrl, { headers });
        
        if (response.ok) {
          const fileData = await response.json();
          
          // Decode base64 content
          if (fileData.content && fileData.encoding === 'base64') {
            readmeContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
            readmePath = readmeFile;
            console.log(`[GitHub Preprocessor] Successfully fetched ${readmeFile}`);
            break;
          }
        } else if (response.status === 404) {
          // File doesn't exist, try next variation
          continue;
        } else {
          console.warn(`[GitHub Preprocessor] Failed to fetch ${readmeFile}: ${response.status} ${response.statusText}`);
        }
      } catch (fetchError) {
        console.warn(`[GitHub Preprocessor] Error fetching ${readmeFile}:`, fetchError);
        continue;
      }
    }
    
    // If no README found, use fallback content
    if (!readmeContent) {
      console.warn(`[GitHub Preprocessor] No README file found in ${owner}/${repo}, using fallback`);
      readmeContent = `# ${repo}\n\nRepository: ${repoUrl}\n\nNo README file found in this repository.`;
    }
    
    return {
      text: readmeContent,
      code: readmeContent,
      metadata: {
        ...metadata,
        repoUrl,
        owner,
        repo,
        branch,
        readmePath: readmePath || null,
        processedAt: new Date().toISOString(),
        hasReadme: !!readmePath,
      },
    };
  } catch (error) {
    console.error('GitHub preprocessing error:', error);
    throw new Error(`Failed to preprocess GitHub repository: ${error.message}`);
  }
}

// Extract code from repository files
export function extractCodeFromRepo(repoPath: string): {
  codeFiles: Array<{
    path: string;
    language: string;
    content: string;
    functions: string[];
    classes: string[];
  }>;
  documentation: Array<{
    path: string;
    content: string;
    type: 'readme' | 'docs' | 'comments';
  }>;
  dependencies: Array<{
    name: string;
    version: string;
    type: 'python' | 'node' | 'other';
  }>;
} {
  // This would parse the repository and extract structured information
  // For now, return placeholder data
  
  return {
    codeFiles: [
      {
        path: 'main.py',
        language: 'python',
        content: 'def main():\n    print("Hello, World!")',
        functions: ['main'],
        classes: [],
      },
    ],
    documentation: [
      {
        path: 'README.md',
        content: 'Project description and setup instructions',
        type: 'readme',
      },
    ],
    dependencies: [
      {
        name: 'numpy',
        version: '1.21.0',
        type: 'python',
      },
    ],
  };
}

// Parse commit history for insights
export function parseCommitHistory(commits: any[]): {
  totalCommits: number;
  contributors: string[];
  recentChanges: string[];
  bugFixes: string[];
  features: string[];
} {
  // This would analyze commit messages and history
  // For now, return placeholder data
  
  return {
    totalCommits: 0,
    contributors: [],
    recentChanges: [],
    bugFixes: [],
    features: [],
  };
}