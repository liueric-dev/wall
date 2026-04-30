import { TUNING } from '../config/tuning'

export function getCurrentPrompt(): string {
  const now = new Date()
  const isBeforeRotation = now.getHours() < TUNING.prompts.rotationHour
  const effectiveDate = isBeforeRotation
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : now
  const daysSinceEpoch = Math.floor(effectiveDate.getTime() / (24 * 60 * 60 * 1000))
  const index = daysSinceEpoch % TUNING.prompts.list.length
  return TUNING.prompts.list[index]
}
