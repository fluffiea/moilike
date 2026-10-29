import type { MoUser } from '../../types/user'
import { clearMoUser, loadMoUser, saveMoUser } from '../session'
import { callFn } from './call'

const NAME = 'user'

type ProfileResult = { ok: true; user: MoUser | null } | { ok: false; error?: string }
type InviteResult = { ok: true; inviteCode: string; paired: boolean } | { ok: false; error?: string }
type PairResult = { ok: true; user: MoUser | null } | { ok: false; error?: string }

export async function fetchProfile(): Promise<ProfileResult> {
  return callFn<ProfileResult>(NAME, { action: 'getProfile' })
}

export async function syncProfile(nickName: string, avatarUrl: string): Promise<ProfileResult> {
  return callFn<ProfileResult>(NAME, { action: 'syncProfile', nickName: nickName, avatarUrl: avatarUrl })
}

export async function refreshSession(): Promise<MoUser | null> {
  try {
    const res = await fetchProfile()
    if (res && res.ok === true) {
      if (res.user && res.user.nickName && res.user.nickName.trim()) {
        saveMoUser(res.user)
        return res.user
      }
      clearMoUser()
      return null
    }
  } catch (err) {
    const local = loadMoUser()
    if (local) return local
    throw err
  }
  const local = loadMoUser()
  return local
}

export async function getInvite(): Promise<InviteResult> {
  return callFn<InviteResult>(NAME, { action: 'getInvite' })
}

export async function refreshInvite(): Promise<InviteResult> {
  return callFn<InviteResult>(NAME, { action: 'refreshInvite' })
}

export async function confirmPair(inviteCode: string): Promise<PairResult> {
  return callFn<PairResult>(NAME, { action: 'confirmPair', inviteCode: inviteCode })
}
