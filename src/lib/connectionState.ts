export type ConnectionState = 'connected' | 'disconnected'

let state: ConnectionState = 'connected'
const subscribers = new Set<(s: ConnectionState) => void>()

export function getConnectionState(): ConnectionState {
  return state
}

export function setConnectionState(next: ConnectionState): void {
  if (state === next) return
  state = next
  subscribers.forEach(fn => fn(next))
}

export function subscribeToConnectionState(
  listener: (s: ConnectionState) => void,
): () => void {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}
