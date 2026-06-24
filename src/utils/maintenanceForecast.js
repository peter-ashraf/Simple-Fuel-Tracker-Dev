const dateValue = (entry) => {
  const raw = entry?.date || entry?.timestamp || entry?.updatedAt || entry?.createdAt;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
};

const numberFrom = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const parseDescription = (value) => {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const getLatestMaintenanceEntriesByCategory = (entries = []) => {
  const latest = new Map();

  entries
    .filter((entry) => !entry.deletedAt && !entry.deleted_at && !entry.pendingDelete)
    .forEach((entry) => {
      const categoryId = entry.type;
      if (!categoryId) return;

      const current = latest.get(categoryId);
      const entryOdometer = numberFrom(entry.performedAtODO, entry.odometer);
      const currentOdometer = numberFrom(current?.performedAtODO, current?.odometer);
      const entryDate = dateValue(entry);
      const currentDate = dateValue(current);

      if (
        !current ||
        entryOdometer > currentOdometer ||
        (entryOdometer === currentOdometer && entryDate > currentDate)
      ) {
        latest.set(categoryId, entry);
      }
    });

  return latest;
};

export const buildMaintenanceForecast = ({
  categories = [],
  entries = [],
  maintenanceSettings = {},
  currentOdometer = 0,
  avgDailyDistance = 0,
} = {}) => {
  const latestByCategory = getLatestMaintenanceEntriesByCategory(entries);

  return categories
    .filter((category) =>
      !category.deletedAt &&
      !category.deleted_at &&
      maintenanceSettings?.categorySettings?.[category.id]?.enabled !== false
    )
    .map((category) => {
      const latestLog = latestByCategory.get(category.id) || null;
      const parsedDescription = parseDescription(latestLog?.description);
      const categorySettings = maintenanceSettings?.categorySettings?.[category.id] || {};
      const intervalKm = numberFrom(
        latestLog?.intervalKm,
        latestLog?.distance,
        parsedDescription.distance,
        categorySettings.intervalKm,
        category.defaultInterval?.value,
        category.defaultDistance,
      );
      const safetyMarginKm = numberFrom(
        latestLog?.safetyMarginKm,
        latestLog?.safety,
        parsedDescription.safety,
        categorySettings.safetyMarginKm,
        category.defaultSafetyMarginKm,
        maintenanceSettings.defaultSafetyMarginKm,
        2000,
      );
      const performedAtODO = numberFrom(latestLog?.performedAtODO, latestLog?.odometer);
      let nextDueODO = latestLog
        ? numberFrom(
            latestLog.nextDueODO,
            latestLog.next_due_odometer,
            latestLog.nextDueOdometer,
            performedAtODO > 0 && intervalKm > 0 ? performedAtODO + intervalKm : 0,
          )
        : 0;

      if (nextDueODO === 0 && performedAtODO > 0 && intervalKm > 0) {
        nextDueODO = performedAtODO + intervalKm;
      }

      const alertODO = nextDueODO > 0 ? Math.max(0, nextDueODO - safetyMarginKm) : 0;
      const remainingKm = nextDueODO > 0 ? nextDueODO - currentOdometer : 0;
      const rawProgress =
        latestLog && intervalKm > 0
          ? ((currentOdometer - performedAtODO) / intervalKm) * 100
          : 0;
      const progressPercent = Math.max(0, Math.min(100, rawProgress));

      let status = "untracked";
      if (latestLog) {
        if (nextDueODO > 0 && currentOdometer >= nextDueODO) status = "overdue";
        else if (alertODO > 0 && currentOdometer >= alertODO) status = "due-soon";
        else status = "healthy";
      }

      const kmUntilDue = Math.max(0, remainingKm);
      const daysRemaining =
        kmUntilDue > 0 && avgDailyDistance > 0
          ? Math.ceil(kmUntilDue / avgDailyDistance)
          : status === "overdue"
            ? 0
            : null;
      const projectedDate = Number.isFinite(daysRemaining) && daysRemaining !== null
        ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000)
        : null;

      return {
        ...category,
        categoryId: category.id,
        categoryColor: category.color,
        latestLog,
        latestLogId: latestLog?.id || null,
        isTracked: Boolean(latestLog),
        date: latestLog?.date || latestLog?.timestamp || null,
        timestamp: latestLog?.timestamp || latestLog?.date || null,
        cost: latestLog?.cost ?? null,
        notes: latestLog?.notes ?? parsedDescription.notes ?? "",
        intervalKm,
        safetyMarginKm,
        performedAtODO,
        nextDueODO,
        nextDueOdometer: nextDueODO,
        next_due_odometer: nextDueODO,
        alertODO,
        remainingKm,
        kmUntilDue,
        daysRemaining,
        projectedDate,
        progressPercent,
        status,
      };
    });
};

export const getReminderState = ({ item, notificationsEnabled }) => {
  if (!item?.isTracked) return "untracked";
  if (!notificationsEnabled) return "notifications-off";
  if (item.status === "overdue") return "overdue";
  if (item.status === "due-soon") return "due-soon";
  return "watching";
};
