const SESSION_KEY = 'wall_session_id'

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

let _id: string | null = null

export function getOrCreateSessionId(): string {
  if (_id) return _id
  _id = localStorage.getItem(SESSION_KEY) ?? uuid()
  localStorage.setItem(SESSION_KEY, _id)
  return _id
}

export function generateId(): string {
  return uuid()
}
