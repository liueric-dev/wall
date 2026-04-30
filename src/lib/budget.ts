import { TUNING } from '../config/tuning'

export type BudgetState = { amount: number; lastUpdated: number }

const STORAGE_KEY = 'wall_budget'

export function loadBudgetState(): BudgetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as BudgetState
  } catch {}
  return { amount: TUNING.budget.initialBudget, lastUpdated: Date.now() }
}

export function saveBudgetState(state: BudgetState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function getCurrentBudget(state: BudgetState): number {
  const elapsedMs = Date.now() - state.lastUpdated
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  const regenerated = elapsedHours * TUNING.budget.regenPerHour
  return Math.min(state.amount + regenerated, TUNING.budget.cap)
}

export function deductBudget(state: BudgetState, amount: number): BudgetState {
  const current = getCurrentBudget(state)
  return {
    amount: Math.max(0, current - amount),
    lastUpdated: Date.now(),
  }
}
