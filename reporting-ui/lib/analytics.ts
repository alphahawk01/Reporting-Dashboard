export function calculateKPIs(data: any[]) {
  const totalHours = data.reduce(
    (sum, r) => sum + (Number(r.total_hours) || 0),
    0
  );

  const totalCost = data.reduce(
    (sum, r) => sum + (Number(r.total_cost) || 0),
    0
  );

  const employees = new Set(data.map(r => r.employee_name));

  return {
    totalHours,
    totalCost,
    employeeCount: employees.size,
    shiftCount: data.length,
  };
}