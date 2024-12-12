import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vsqjdfxsbgdlmihbzmcr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWpkZnhzYmdkbG1paGJ6bWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM5ODI4OTcsImV4cCI6MjA0OTU1ODg5N30.sPjWaUfoaAtUPLiUrW2rYOBZDtH9wL-ME3Z80iQznWo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Semantic search function
export async function semanticSearch(query) {
  try {
    const { data, error } = await supabase.functions.invoke('claude-search', {
      body: { query }
    })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Semantic search error:', error)
    throw error
  }
}

// Auth functions
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// Check if user is Pro
export async function checkProStatus() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single()
    
    if (profileError) throw profileError
    return data?.is_pro || false
  } catch (error) {
    console.error('Error checking pro status:', error)
    return false
  }
}
