import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, Org } from './supabase'

export type AppSession = { loading: boolean; session: Session | null; org: Org | null; refreshOrg: () => void }

export function useSession(): AppSession {
  const [ready, setReady] = useState(false) // initial session restore finished
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(prev => {
        // TOKEN_REFRESHED delivers a fresh object for the SAME user roughly hourly
        // (and when a backgrounded tab wakes). Keeping the previous reference stops
        // the org effect re-firing, which used to flip the whole app to "Loading…"
        // and unmount every page — destroying in-progress work like a staged
        // screening package. Anything needing the live token calls
        // supabase.auth.getSession() directly, never this state.
        if (prev && s && prev.user.id === s.user.id) return prev
        return s
      }))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!session) { setOrg(null); setLoading(false); return }
    setLoading(true)
    supabase
      .from('org_members')
      .select('orgs(id, name, invite_code)')
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as { orgs: Org } | undefined
        setOrg(row?.orgs ?? null)
        setLoading(false)
      })
  }, [ready, session, tick])

  return { loading: loading || !ready, session, org, refreshOrg: () => setTick(t => t + 1) }
}
