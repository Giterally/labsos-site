import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Database types matching the new schema
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          lab_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name?: string | null
          lab_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          lab_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          institution: string | null
          department: string | null
          status: 'draft' | 'active' | 'completed' | 'archived'
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          institution?: string | null
          department?: string | null
          status?: 'draft' | 'active' | 'completed' | 'archived'
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          institution?: string | null
          department?: string | null
          status?: 'draft' | 'active' | 'completed' | 'archived'
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      project_members: {
        Row: {
          id: string
          project_id: string
          user_id: string
          role: string
          initials: string | null
          joined_at: string
          left_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          role: string
          initials?: string | null
          joined_at?: string
          left_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          role?: string
          initials?: string | null
          joined_at?: string
          left_at?: string | null
        }
      }
      experiment_trees: {
        Row: {
          id: string
          project_id: string
          name: string
          description: string | null
          status: 'draft' | 'active' | 'completed' | 'archived'
          category: 'protocol' | 'analysis' | 'data_collection' | 'results'
          node_count: number
          node_types: any
          linked_datasets: string[]
          linked_software: string[]
          linked_outputs: string[]
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          description?: string | null
          status?: 'draft' | 'active' | 'completed' | 'archived'
          category?: 'protocol' | 'analysis' | 'data_collection' | 'results'
          node_count?: number
          node_types?: any
          linked_datasets?: string[]
          linked_software?: string[]
          linked_outputs?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          description?: string | null
          status?: 'draft' | 'active' | 'completed' | 'archived'
          category?: 'protocol' | 'analysis' | 'data_collection' | 'results'
          node_count?: number
          node_types?: any
          linked_datasets?: string[]
          linked_software?: string[]
          linked_outputs?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      software: {
        Row: {
          id: string
          name: string
          type: 'internal' | 'external'
          category: 'analysis' | 'visualization' | 'data_processing' | 'simulation' | 'other'
          description: string | null
          version: string | null
          license_type: 'free' | 'paid' | 'academic' | 'commercial' | null
          license_cost: number | null
          license_period: 'monthly' | 'yearly' | 'one_time' | null
          repository_url: string | null
          documentation_url: string | null
          used_by: string[]
          linked_datasets: string[]
          linked_outputs: string[]
          created_by: string | null
          last_updated: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          type: 'internal' | 'external'
          category: 'analysis' | 'visualization' | 'data_processing' | 'simulation' | 'other'
          description?: string | null
          version?: string | null
          license_type?: 'free' | 'paid' | 'academic' | 'commercial' | null
          license_cost?: number | null
          license_period?: 'monthly' | 'yearly' | 'one_time' | null
          repository_url?: string | null
          documentation_url?: string | null
          used_by?: string[]
          linked_datasets?: string[]
          linked_outputs?: string[]
          created_by?: string | null
          last_updated?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: 'internal' | 'external'
          category?: 'analysis' | 'visualization' | 'data_processing' | 'simulation' | 'other'
          description?: string | null
          version?: string | null
          license_type?: 'free' | 'paid' | 'academic' | 'commercial' | null
          license_cost?: number | null
          license_period?: 'monthly' | 'yearly' | 'one_time' | null
          repository_url?: string | null
          documentation_url?: string | null
          used_by?: string[]
          linked_datasets?: string[]
          linked_outputs?: string[]
          created_by?: string | null
          last_updated?: string
          created_at?: string
        }
      }
      datasets: {
        Row: {
          id: string
          name: string
          type: 'raw_data' | 'processed_data' | 'training_data' | 'validation_data'
          description: string | null
          format: string | null
          file_size: number | null
          size_unit: string
          access_level: 'public' | 'restricted' | 'private'
          repository_url: string | null
          linked_software: string[]
          linked_outputs: string[]
          linked_trees: string[]
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: 'raw_data' | 'processed_data' | 'training_data' | 'validation_data'
          description?: string | null
          format?: string | null
          file_size?: number | null
          size_unit?: string
          access_level: 'public' | 'restricted' | 'private'
          repository_url?: string | null
          linked_software?: string[]
          linked_outputs?: string[]
          linked_trees?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: 'raw_data' | 'processed_data' | 'training_data' | 'validation_data'
          description?: string | null
          format?: string | null
          file_size?: number | null
          size_unit?: string
          access_level?: 'public' | 'restricted' | 'private'
          repository_url?: string | null
          linked_software?: string[]
          linked_outputs?: string[]
          linked_trees?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      outputs: {
        Row: {
          id: string
          type: 'publication' | 'software' | 'dataset' | 'presentation' | 'report' | 'patent'
          title: string
          description: string | null
          authors: string[]
          status: 'published' | 'submitted' | 'in_preparation' | 'draft'
          date: string | null
          url: string | null
          doi: string | null
          journal: string | null
          impact_factor: number | null
          citations: number | null
          repository_url: string | null
          license: string | null
          file_size: number | null
          format: string | null
          linked_datasets: string[]
          linked_software: string[]
          linked_trees: string[]
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: 'publication' | 'software' | 'dataset' | 'presentation' | 'report' | 'patent'
          title: string
          description?: string | null
          authors?: string[]
          status: 'published' | 'submitted' | 'in_preparation' | 'draft'
          date?: string | null
          url?: string | null
          doi?: string | null
          journal?: string | null
          impact_factor?: number | null
          citations?: number | null
          repository_url?: string | null
          license?: string | null
          file_size?: number | null
          format?: string | null
          linked_datasets?: string[]
          linked_software?: string[]
          linked_trees?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          type?: 'publication' | 'software' | 'dataset' | 'presentation' | 'report' | 'patent'
          title?: string
          description?: string | null
          authors?: string[]
          status?: 'published' | 'submitted' | 'in_preparation' | 'draft'
          date?: string | null
          url?: string | null
          doi?: string | null
          journal?: string | null
          impact_factor?: number | null
          citations?: number | null
          repository_url?: string | null
          license?: string | null
          file_size?: number | null
          format?: string | null
          linked_datasets?: string[]
          linked_software?: string[]
          linked_trees?: string[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
