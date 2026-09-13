export async function recoverWindowSession(session, { persist, restore }) {
  if (!session?.originalWindow) return { restored: true };
  const pending = { ...session, phase: "restore_pending", restorePending: true };
  await persist(pending);
  try {
    await restore(session.originalWindow);
    return { restored: true };
  } catch {
    await persist({ ...pending, restoreErrorCategory: "responsive_mode_failed" });
    return { restored: false };
  }
}
