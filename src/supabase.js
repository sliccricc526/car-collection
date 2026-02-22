import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bftdnuyjwbwvbvszioak.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmdGRudXlqd2J3dmJ2c3ppb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MzY5NzIsImV4cCI6MjA4NzMxMjk3Mn0.HwlYA6r6SI_6xRNCX5rdZvb_uw7I4DZ0Z4syaKmshyA'

export const supabase = createClient(supabaseUrl, supabaseKey)