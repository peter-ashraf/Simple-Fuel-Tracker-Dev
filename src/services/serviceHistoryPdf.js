import { format } from 'date-fns';

export const serviceHistoryPdf = {
  async generatePdf(vehicle, maintenanceEntries, t, options = {}) {
    if (!vehicle || !maintenanceEntries || maintenanceEntries.length === 0) {
      return false;
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF();
    const currentDate = format(new Date(), 'MMM d, yyyy');
    const {
      categories = [],
      systems = [],
      sortBy = 'odometer',
      systemIds = [],
      columns = ['date', 'odometer', 'type', 'interval', 'nextDue', 'cost', 'notes']
    } = options;

    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const systemByCategoryId = new Map();
    systems.forEach((system) => {
      (system.categories || []).forEach((categoryId) => {
        if (!systemByCategoryId.has(categoryId)) systemByCategoryId.set(categoryId, system.id);
      });
    });
    const getCategoryName = (type) => {
      const category = categoryById.get(type);
      if (!category) return t(type) || type;
      if (category.isDefault === false || category.is_default === false) return category.name || type;
      const translated = t(category.id);
      return translated === category.id ? category.name || category.id : translated;
    };

    const preparedEntries = [...maintenanceEntries]
      .filter((entry) => {
        if (!systemIds.length) return true;
        const entrySystem = entry.systemStableKey || entry.system_stable_key || systemByCategoryId.get(entry.type);
        return systemIds.includes(entrySystem);
      })
      .sort((a, b) => {
        if (sortBy === 'date') {
          return new Date(a.date || a.timestamp || a.createdAt || 0) - new Date(b.date || b.timestamp || b.createdAt || 0);
        }
        const aOdo = Number(a.performedAtODO ?? a.odometer ?? 0);
        const bOdo = Number(b.performedAtODO ?? b.odometer ?? 0);
        return aOdo - bOdo;
      });

    // Title
    doc.setFontSize(20);
    doc.text(t('maintenance_history') || 'Maintenance History', 14, 22);

    // Vehicle & Date Info
    doc.setFontSize(12);
    doc.text(`${t('vehicle') || 'Vehicle'}: ${vehicle.name}`, 14, 32);
    doc.text(`${t('date') || 'Date'}: ${currentDate}`, 14, 40);

    // Table Data
    const columnDefs = {
      date: t('date') || "Date",
      odometer: t('odometer') || "Odometer",
      type: t('service_type') || "Service Type",
      interval: t('distance') || "Interval",
      nextDue: t('next_due') || "Next Due",
      cost: t('price') || "Cost",
      notes: t('notes') || "Notes"
    };
    const tableColumn = columns.map((column) => columnDefs[column]).filter(Boolean);
    
    const tableRows = preparedEntries.map(entry => {
      let metadata = {};
      if (entry.description && typeof entry.description === 'string') {
        try {
          const parsed = JSON.parse(entry.description);
          metadata = parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          metadata = {};
        }
      }
      const entryDate = format(new Date(entry.date || entry.timestamp || entry.createdAt), 'MMM d, yyyy');
      const odometer = Number(entry.performedAtODO ?? entry.odometer ?? 0);
      const interval = Number(entry.intervalKm ?? entry.distance ?? metadata.distance ?? 0);
      const nextDue = Number(entry.nextDueODO ?? entry.nextDueOdometer ?? entry.next_due_odometer ?? 0);
      const cost = entry.cost !== undefined && entry.cost !== null ? Number(entry.cost) : null;
      const odo = odometer ? `${odometer.toLocaleString()} km` : '-';
      const type = getCategoryName(entry.type);
      const notes = entry.notes || metadata.notes || '-';
      const values = {
        date: entryDate,
        odometer: odo,
        type,
        interval: interval ? `${interval.toLocaleString()} km` : '-',
        nextDue: nextDue ? `${nextDue.toLocaleString()} km` : '-',
        cost: cost !== null && !Number.isNaN(cost) ? `${cost.toFixed(2)}` : '-',
        notes
      };

      return columns.map((column) => values[column]);
    });

    // Generate Table
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 48,
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [16, 185, 129] }, // Emerald 500
    });

    // Save PDF
    const filename = `Maintenance_History_${vehicle.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(filename);
    return true;
  }
};
