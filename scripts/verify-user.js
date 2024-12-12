import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verifyUser() {
  try {
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', '8b4e7f8f-2f16-4869-a903-1e84b77e51dd')
      .single()

    if (profileError) throw profileError

    console.log('\nUser Profile:')
    console.log(JSON.stringify(profile, null, 2))

    // Get user auth details
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(
      '8b4e7f8f-2f16-4869-a903-1e84b77e51dd'
    )

    if (userError) throw userError

    console.log('\nUser Auth Details:')
    console.log(JSON.stringify(user, null, 2))

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    process.exit(0)
  }
}

verifyUser()
