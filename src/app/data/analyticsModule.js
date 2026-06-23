import { ECHAGUE_BARANGAYS, matchBarangayName } from './gisConfig';

const today = new Date();
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (days) => {
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  return isoDate(date);
};

const incidentBlueprints = [
  ['Silauan Sur (Poblacion)', 'Trauma', 'Fire Rescue Incident', 'High', 'Structure fire response', 0, '09:15'],
  ['Silauan Norte (Poblacion)', 'Medical', 'Pediatric', 'Medium', 'Pediatric transport', 0, '13:40'],
  ['Taggappan (Poblacion)', 'MVC', 'Collision', 'Critical', 'Two-vehicle collision', 0, '18:22'],
  ['Soyung (Poblacion)', 'Medical', 'Obstetrical', 'High', 'Labor referral', 0, '07:45'],
  ['San Miguel', 'MVC', 'Collision', 'Critical', 'Motorcycle and private vehicle crash', 0, '08:23'],
  ['San Antonio Ugad', 'MVC', 'Self-Accident', 'High', 'Single motorcycle crash', 0, '16:05'],
  ['San Fabian', 'Medical', 'Psychiatric', 'Medium', 'Behavioral health assist', 0, '11:18'],
  ['San Juan', 'Trauma', 'Fall', 'Low', 'Fall injury assessment', 0, '10:30'],
  ['Villa Victoria', 'Medical', 'Surgical', 'Medium', 'Wound care transport', 0, '12:15'],
  ['Pag-asa', 'Trauma', 'Domestic Violence', 'High', 'Domestic violence response', 0, '14:05'],
  ['Gucab', 'Trauma', 'Electrocution', 'Critical', 'Electrical injury', 0, '15:20'],
  ['Malitao', 'Medical', 'Pediatric', 'Medium', 'Child fever transport', 0, '17:35'],
  ['Gumbauan', 'MVC', 'Collision', 'Critical', 'Truck crash near bridge', 0, '19:10'],
  ['Dicaraoyan', 'Trauma', 'Other Trauma', 'Low', 'Minor injury response', 0, '21:00'],
  ['Dammang West', 'Trauma', 'Fire Rescue Incident', 'High', 'Grass fire assist', -1, '16:45'],
  ['Buneg', 'Medical', 'Check-up', 'Low', 'Routine patient transfer', -2, '09:30'],
  ['Malitao', 'Medical', 'Dialysis', 'Medium', 'Dialysis transport', -3, '05:50'],
  ['San Juan', 'MVC', 'Self-Accident', 'High', 'Road crash response', -4, '22:10'],
  ['Villa Victoria', 'Medical', 'Conduction', 'Low', 'Patient conduction', -7, '06:40'],
  ['Pag-asa', 'Trauma', 'Fall', 'Medium', 'Fall from height', -12, '14:55'],
];

export const analyticsIncidents = incidentBlueprints.map(([barangay, classification, subtype, priority, title, dayOffset, time], index) => ({
  id: `AN-${String(index + 1).padStart(4, '0')}`,
  barangay: matchBarangayName(barangay),
  classification,
  subtype,
  priority,
  title,
  date: addDays(dayOffset),
  time,
  month: new Date(addDays(dayOffset)).getMonth(),
  mvc: classification === 'MVC'
    ? {
        crashType: subtype,
        vehicleType: index % 3 === 0 ? 'Tricycle' : index % 3 === 1 ? 'Single Motorcycle' : 'Private Vehicle',
        personInvolved: index % 2 === 0 ? 'Driver' : 'Passenger',
        engineSize: index % 2 === 0 ? 'Below 4500cc' : 'Above 4500cc',
        licenseStatus: index % 2 === 0 ? 'Licensed' : 'Unlicensed',
        helmetUsage: index % 2 === 0 ? 'Helmet Worn' : 'No Helmet',
        alcoholInvolvement: index % 3 === 0 ? 'Alcohol Positive' : 'Alcohol Negative',
      }
    : null,
}));

const monthlyRows = [
  ['Conduction', [2, 1, 4, 2, 3, 5, 4, 3, 2, 4, 3, 5]],
  ['Dialysis', [9, 8, 10, 7, 9, 11, 10, 9, 8, 10, 9, 12]],
  ['Check-up', [5, 4, 6, 5, 7, 8, 6, 5, 7, 6, 5, 7]],
  ['Travel (Within Region II)', [3, 2, 4, 3, 5, 4, 3, 4, 2, 5, 4, 3]],
  ['Travel (Outside Region II)', [1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2]],
  ['Medical', [18, 15, 22, 19, 24, 27, 23, 21, 20, 25, 22, 28]],
  ['Pediatric', [5, 3, 6, 4, 7, 8, 6, 5, 4, 6, 5, 7]],
  ['Psychiatric', [2, 2, 3, 2, 4, 3, 2, 3, 2, 3, 2, 4]],
  ['Surgical', [4, 3, 5, 4, 5, 6, 4, 5, 4, 5, 4, 6]],
  ['Obstetrical', [3, 4, 4, 3, 5, 5, 4, 4, 3, 5, 4, 5]],
  ['Trauma', [11, 10, 14, 12, 15, 17, 14, 13, 12, 16, 14, 18]],
  ['Fall', [4, 3, 5, 4, 5, 6, 5, 4, 4, 5, 4, 6]],
  ['Electrocution', [1, 0, 1, 1, 0, 2, 1, 1, 0, 1, 1, 2]],
  ['Domestic Violence', [2, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 3]],
  ['Fire Rescue Incident', [3, 4, 4, 5, 3, 5, 4, 4, 5, 4, 3, 5]],
  ['Motor Vehicle Crash Type', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Collision', [8, 7, 10, 8, 11, 13, 10, 9, 8, 12, 10, 14]],
  ['Self-Accident', [4, 3, 5, 3, 5, 5, 5, 5, 4, 5, 5, 5]],
  ['Vehicle Type', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Bicycle', [1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2]],
  ['Tricycle', [4, 3, 5, 4, 5, 6, 5, 5, 4, 5, 5, 6]],
  ['Single Motorcycle', [6, 5, 7, 5, 8, 9, 8, 7, 6, 9, 8, 10]],
  ['Person Involved', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Driver', [7, 6, 9, 6, 10, 11, 9, 8, 7, 10, 9, 12]],
  ['Passenger', [3, 3, 4, 3, 4, 5, 4, 4, 3, 5, 4, 5]],
  ['Pedestrian', [2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]],
  ['Engine Size', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Above 4500cc', [2, 1, 3, 2, 3, 4, 3, 2, 2, 3, 3, 4]],
  ['Below 4500cc', [10, 9, 12, 9, 13, 14, 12, 12, 10, 14, 12, 15]],
  ['License', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Licensed (+)', [8, 7, 10, 8, 11, 13, 10, 9, 8, 12, 10, 14]],
  ['Unlicensed (-)', [4, 3, 5, 3, 5, 5, 5, 5, 4, 5, 5, 5]],
  ['Helmet', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Helmet (+)', [7, 6, 9, 7, 10, 11, 9, 8, 7, 10, 9, 12]],
  ['Helmet (-)', [5, 4, 6, 4, 6, 7, 6, 6, 5, 7, 6, 7]],
  ['Alcohol', [12, 10, 15, 11, 16, 18, 15, 14, 12, 17, 15, 19]],
  ['Alcohol (+)', [2, 2, 3, 2, 3, 4, 3, 2, 2, 3, 3, 4]],
  ['Alcohol (-)', [10, 8, 12, 9, 13, 14, 12, 12, 10, 14, 12, 15]],
];

export const reportRows = monthlyRows.map(([category, values]) => ({
  category,
  values,
  total: values.reduce((sum, value) => sum + value, 0),
}));

export const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const filterOptions = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
];

export function filterIncidentsByRange(items, range, customRange = {}) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'week') {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'custom') {
    const customStart = customRange.start ? new Date(customRange.start) : start;
    const customEnd = customRange.end ? new Date(customRange.end) : end;
    customStart.setHours(0, 0, 0, 0);
    customEnd.setHours(23, 59, 59, 999);
    return items.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= customStart && itemDate <= customEnd;
    });
  }

  return items.filter((item) => {
    const itemDate = new Date(item.date);
    return itemDate >= start && itemDate <= end;
  });
}

export function summarizeBy(items, keyGetter) {
  const total = items.length || 1;
  const counts = items.reduce((acc, item) => {
    const key = typeof keyGetter === 'function' ? keyGetter(item) : item[keyGetter];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

export function getBarangayStats(items, barangays = ECHAGUE_BARANGAYS) {
  const total = items.length || 1;
  return barangays
    .map((barangay) => {
      const barangayIncidents = items.filter((item) => matchBarangayName(item.barangay, barangays) === barangay);
      const categories = summarizeBy(barangayIncidents, 'classification');
      const priorities = summarizeBy(barangayIncidents, 'priority');
      return {
        name: barangay,
        count: barangayIncidents.length,
        percent: Math.round((barangayIncidents.length / total) * 100),
        trend: barangayIncidents.length >= 2 ? 'up' : barangayIncidents.length === 1 ? 'stable' : 'down',
        categories,
        priorities,
        critical: barangayIncidents.filter((item) => item.priority === 'Critical').length,
        high: barangayIncidents.filter((item) => item.priority === 'High').length,
        medium: barangayIncidents.filter((item) => item.priority === 'Medium').length,
        low: barangayIncidents.filter((item) => item.priority === 'Low').length,
        mostCommonIncidentType: categories[0]?.name || 'No incidents',
        latest: [...barangayIncidents].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 4),
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function totalReportRows(rows = reportRows) {
  return rows.reduce((sum, row) => sum + row.total, 0);
}
