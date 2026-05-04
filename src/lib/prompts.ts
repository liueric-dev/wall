import { supabase } from './supabase'

let cached: { text: string; date: string } | null = null

export async function getCurrentPrompt(): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  if (cached?.date === today) return cached.text

  const { data, error } = await supabase.rpc('get_or_create_daily_prompt')
  if (error || !data || data.length === 0) return ''

  cached = { text: data[0].text, date: today }
  return cached.text
}
