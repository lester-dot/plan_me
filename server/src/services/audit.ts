import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

// Журнал доступа/действий (152-ФЗ: фиксируем операции с данными).
export async function logAudit(
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({ userId, action, entity, entityId, meta: meta ?? null });
  } catch {
    // журнал не должен ронять запрос
  }
}
