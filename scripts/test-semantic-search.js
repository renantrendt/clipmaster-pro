import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

async function testSemanticSearch() {
  try {
    // 1. Sign in as test user
    const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'test@clipmaster.pro',
      password: 'TestUser123!'
    })

    if (signInError) throw signInError
    console.log('✅ Signed in successfully')
    console.log('\n🔑 Session Token:', session.access_token)

    // 2. Test semantic search
    const { data, error } = await supabase.functions.invoke('claude-search', {
      body: { query: 'Find code snippets about React hooks' }
    })

    if (error) {
      console.error('Function Error Details:', {
        message: error.message,
        name: error.name,
        status: error?.status,
        statusText: error?.statusText,
        details: error?.details
      })
      throw error
    }

    console.log('\n🔍 Semantic Search Results:')
    console.log(JSON.stringify(data, null, 2))

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    // Let's also check our search history
    try {
      const { data: searches, error: searchError } = await supabase
        .from('searches')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)

      if (searchError) throw searchError

      console.log('\n📝 Latest Search:')
      console.log(JSON.stringify(searches[0], null, 2))
    } catch (error) {
      console.error('Failed to fetch search history:', error.message)
    }
    
    process.exit(0)
  }
}

testSemanticSearch()
