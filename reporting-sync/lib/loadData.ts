export async function loadData() {
  const res = await fetch("/api/data");
  return res.json();
}