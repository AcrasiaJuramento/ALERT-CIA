import { useState } from 'react';
import { TrendingUp, TrendingDown, BarChart2, Calendar, Download, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { analyticsData } from '../data/mockData';
import { useTheme } from '../contexts/ThemeContext';

const kpiCards = [
  { label: 'Total Incidents (March)', value: '80', change: '+12%', trend: 'up', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  { label: 'Avg Response Time', value: '7.4 min', change: '-15%', trend: 'down', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  { label: 'Resolution Rate', value: '84%', change: '+3%', trend: 'up', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { label: 'Active Teams', value: '5', change: '0%', trend: 'neutral', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 shadow-xl">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground capitalize">{entry.name}:</span>
            <span className="text-foreground font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const [dateRange, setDateRange] = useState('month');
  const { isDarkMode } = useTheme();

  const gridColor = isDarkMode ? '#1e293b' : '#e2e8f0';
  const axisColor = isDarkMode ? '#64748b' : '#94a3b8';

  return (
    <div className="p-5 space-y-5 bg-background min-h-full transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">Performance metrics and incident trend analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-secondary border border-border rounded-lg overflow-hidden text-xs">
            {['week', 'month', '3months', 'year'].map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-2 capitalize transition-all ${
                  dateRange === range ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range === '3months' ? '3M' : range === 'week' ? 'Week' : range === 'month' ? 'Month' : 'Year'}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map(({ label, value, change, trend, color, bg, border }) => (
          <div key={label} className={`p-4 rounded-xl border ${bg} ${border} bg-card transition-colors duration-300`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
              <div className={`flex items-center gap-0.5 text-[10px] font-medium ${
                trend === 'up' ? (label.includes('Time') ? 'text-red-400' : 'text-green-400') :
                trend === 'down' ? (label.includes('Time') ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground'
              }`}>
                {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
                {change}
              </div>
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Incidents by Month (stacked bar) */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-4 transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Incidents by Type — Monthly</h3>
              <p className="text-xs text-muted-foreground">Last 6 months breakdown</p>
            </div>
            <BarChart2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analyticsData.incidentsByMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="vehicular" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="medical" stackId="a" fill="#3B82F6" />
              <Bar dataKey="fire" stackId="a" fill="#F97316" />
              <Bar dataKey="flood" stackId="a" fill="#0EA5E9" />
              <Bar dataKey="crime" stackId="a" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2">
            {[
              { color: '#EF4444', label: 'Vehicular' },
              { color: '#3B82F6', label: 'Medical' },
              { color: '#F97316', label: 'Fire' },
              { color: '#0EA5E9', label: 'Flood' },
              { color: '#8B5CF6', label: 'Crime' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident Types Pie */}
        <div className="bg-card border border-border rounded-xl p-4 transition-colors duration-300">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Incident Distribution</h3>
            <p className="text-xs text-muted-foreground">By type (all time)</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={analyticsData.incidentsByType}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {analyticsData.incidentsByType.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: isDarkMode ? '#1e293b' : '#ffffff',
                  border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: isDarkMode ? '#e2e8f0' : '#1e293b',
                }}
                itemStyle={{ color: isDarkMode ? '#e2e8f0' : '#1e293b' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {analyticsData.incidentsByType.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-muted-foreground">{name}</span>
                </div>
                <span className="text-[10px] font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Response Time by Hour */}
        <div className="bg-card border border-border rounded-xl p-4 transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Avg Response Time by Hour</h3>
              <p className="text-xs text-muted-foreground">Peak response hours analysis</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={analyticsData.responseTime} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="time" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="avgMin"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#colorResponse)"
                name="Avg Minutes"
              />
              <defs>
                <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Trend */}
        <div className="bg-card border border-border rounded-xl p-4 transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Weekly Incident Trend</h3>
              <p className="text-xs text-muted-foreground">Incidents vs. resolved this week</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={analyticsData.weeklyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="day" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="incidents"
                stroke="#EF4444"
                strokeWidth={2}
                dot={{ fill: '#EF4444', r: 3 }}
                name="Reported"
              />
              <Line
                type="monotone"
                dataKey="resolved"
                stroke="#22C55E"
                strokeWidth={2}
                dot={{ fill: '#22C55E', r: 3 }}
                name="Resolved"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-red-400" />
              <span className="text-[10px] text-muted-foreground">Reported</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-green-400" />
              <span className="text-[10px] text-muted-foreground">Resolved</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Locations */}
      <div className="bg-card border border-border rounded-xl p-4 transition-colors duration-300">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Top Incident Locations (Hotspots)</h3>
            <p className="text-xs text-muted-foreground">Locations with highest incident frequency</p>
          </div>
        </div>
        <div className="space-y-3">
          {analyticsData.topLocations.map(({ location, incidents: count }, i) => {
            const max = analyticsData.topLocations[0].incidents;
            const pct = (count / max) * 100;
            return (
              <div key={location} className="flex items-center gap-4">
                <span className="w-4 text-[10px] text-muted-foreground font-mono">{i + 1}</span>
                <div className="w-36 text-xs text-foreground/80 truncate">{location}</div>
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-500' : i === 2 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-foreground font-semibold w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Prediction Note */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-400 mb-1">AI Spatial-Temporal Predictions</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Based on historical patterns, <strong className="text-foreground">Saturday afternoons (14:00–18:00)</strong> have the highest incident probability on Maharlika Highway (+35% above baseline). 
              <strong className="text-foreground"> Flash flood risk</strong> in Brgy. Pandan and Bagumbayan is elevated this week due to weather patterns. 
              AI model confidence: <strong className="text-green-400">87%</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}