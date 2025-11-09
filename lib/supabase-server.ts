import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server-side client with service role key - bypasses RLS
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Create authenticated client from user token for RLS policies
export async function createAuthenticatedClient(token: string) {
  console.log('DEBUG: createAuthenticatedClient called with token length:', token.length);
  
  // Create client with anon key
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Verify the token and get user info
  const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);
  console.log('DEBUG: getUser result:', { user: user?.email, error: getUserError?.message });
  
  if (getUserError || !user) {
    console.error('DEBUG: getUser failed:', getUserError);
    throw new Error('Invalid or expired token');
  }

  console.log('DEBUG: User details:', {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    user_metadata: user.user_metadata
  });

  // Create a new client for authenticated requests
  const authenticatedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Set the session with the access token to enable RLS policies
  // For server-side, we use the access token as both access_token and refresh_token
  // The refresh_token is required by setSession but won't be used since autoRefreshToken is false
  const { data: sessionData, error: sessionError } = await authenticatedClient.auth.setSession({
    access_token: token,
    refresh_token: token, // Using same token as refresh - won't be used with autoRefreshToken: false
  });

  if (sessionError) {
    console.error('DEBUG: setSession failed:', sessionError);
    // Fallback: try with just Authorization header if setSession fails
    // This is a workaround for cases where setSession doesn't work
    const fallbackClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return { client: fallbackClient, user };
  }

  console.log('DEBUG: Session set successfully for user:', user.email);
  return { client: authenticatedClient, user };
}
