import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role key to bypass RLS
)

async function createTestUser() {
  try {
    // 1. Create a test user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'test@clipmaster.pro',
      password: 'TestUser123!',
      email_confirm: true // Auto-confirm email
    })

    if (authError) throw authError
    console.log('✅ User created:', authData.user.id)

    // 2. Make the user Pro
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_pro: true })
      .eq('id', authData.user.id)

    if (updateError) throw updateError
    console.log('✅ User upgraded to Pro')

    console.log('\nTest User Credentials:')
    console.log('Email:', 'test@clipmaster.pro')
    console.log('Password:', 'TestUser123!')
    console.log('User ID:', authData.user.id)

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    process.exit(0)
  }
}

createTestUser()
