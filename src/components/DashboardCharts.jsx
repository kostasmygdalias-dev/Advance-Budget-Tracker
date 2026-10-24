import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

// The Dashboard's charts, kept apart from the page and loaded lazily so the
// page's numbers and lists don't wait on recharts (the largest chunk in the
// app). Each fills the sized box its caller puts it in.

export function DonutChart({ data, dataKey, nameKey, fills, innerRadius, outerRadius, paddingAngle, startAngle, endAngle, tooltipFormatter }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data} dataKey={dataKey} nameKey={nameKey} innerRadius={innerRadius} outerRadius={outerRadius}
          paddingAngle={paddingAngle} startAngle={startAngle} endAngle={endAngle}
        >
          {data.map((d, i) => <Cell key={i} fill={fills[i]} />)}
        </Pie>
        {tooltipFormatter && <Tooltip formatter={tooltipFormatter} />}
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, tooltipFormatter, incomeLabel, expenseLabel }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          formatter={tooltipFormatter}
          cursor={{ fill: 'hsl(var(--muted))' }}
          contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name={incomeLabel} fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name={expenseLabel} fill="#0f172a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
