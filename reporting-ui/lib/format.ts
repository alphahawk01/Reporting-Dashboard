export const formatHours = (v: any) =>
  Number(v || 0).toFixed(2);

export const formatMoney = (v: any) =>
  `$${Number(v || 0).toFixed(2)}`;