const axios = require("axios");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

// ----------------------
// ENV
// ----------------------
if (process.env.CI !== "true") {
  require("dotenv").config();
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CHUNK_SIZE = 500;

let syncLogId = null;

// ----------------------
// LOGGING
// ----------------------
async function logStart(source) {
  const { data, error } = await supabase
    .from("sync_logs")
    .insert({
      source,
      started_at: new Date(),
      status: "running",
      row_count: 0,
    })
    .select()
    .single();

  if (error) throw error;

  syncLogId = data.id;
}

async function logSuccess(rowCount) {
  if (!syncLogId) return;

  await supabase
    .from("sync_logs")
    .update({
      finished_at: new Date(),
      status: "success",
      row_count: rowCount,
    })
    .eq("id", syncLogId);
}

async function logFailure(err) {
  if (!syncLogId) return;

  await supabase
    .from("sync_logs")
    .update({
      finished_at: new Date(),
      status: "failed",
      error_message: err.message || String(err),
    })
    .eq("id", syncLogId);
}

// ----------------------
// HELPERS
// ----------------------
function excelTimeToString(value) {
  if (!value) return null;

  const num = Number(value);
  if (isNaN(num)) return value;

  const totalSeconds = Math.round(num * 86400);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function excelDateToJS(serial) {
  if (!serial) return null;
  return new Date((serial - 25569) * 86400 * 1000)
    .toISOString()
    .split("T")[0];
}

// ----------------------
// SHEET PICKER
// ----------------------
function getSheet(workbook, names) {
  const found = workbook.SheetNames.find(name =>
    names.some(n => name.toLowerCase().includes(n.toLowerCase()))
  );

  if (!found) {
    throw new Error(`Sheet not found: ${workbook.SheetNames.join(", ")}`);
  }

  return workbook.Sheets[found];
}

// ----------------------
// AUTH (GRAPH)
// ----------------------
async function getToken() {
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    })
  );

  return res.data.access_token;
}
// ----------------------
// DOWNLOAD EXCEL
// ----------------------
async function getExcelBuffer() {
  const token = await getToken();

  const metaUrl =
    `https://graph.microsoft.com/v1.0/sites/${process.env.SITE_ID}` +
    `/drives/${process.env.DRIVE_ID}` +
    `/root:/DeputyRoster.csv.xlsx`;

  const meta = await axios.get(metaUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const downloadUrl = meta.data["@microsoft.graph.downloadUrl"];

  console.log("📥 Downloading Deputy Roster...");

  const file = await axios.get(downloadUrl, {
    responseType: "arraybuffer",
  });

  return file.data;
}

// ----------------------
// PARSE DEPUTY
// ----------------------
function parseDeputyRoster(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return rows
  .slice(1)
  .filter(r => r && r.length)
  .map(r => ({
    roster_key: `${r[13]}_${excelDateToJS(r[3])}_${excelTimeToString(r[4])}`,

    employee_name: r[2] || null,
    email: r[13] || null,

    location: r[0] || null,
    area_name: r[1] || null,

    shift_date: excelDateToJS(r[3]),
    start_time: excelTimeToString(r[4]),

    end_date: excelDateToJS(r[5]),
    end_time: excelTimeToString(r[6]),

    total_hours: Number(r[9]) || 0,

    status: r[10] || null,
    note: r[11] || null,
    cost: Number(r[12]) || 0,

    week: Number(r[14]) || null,
  }));
}

// ----------------------
// DEDUPE
// ----------------------
function dedupe(records, key) {
  const map = new Map();

  for (const r of records) {
    if (map.has(r[key])) {
      console.log("\n==================================");
      console.log("DUPLICATE SHIFT FOUND");
      console.log("Key:", r[key]);
      console.log("First Row:", map.get(r[key]));
      console.log("Second Row:", r);
      console.log("==================================\n");
    }

    map.set(r[key], r);
  }

  return [...map.values()];
}
// ----------------------
// UPLOAD DEPUTY
// ----------------------
async function uploadRoster(records) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {

    const chunk = records.slice(i, i + CHUNK_SIZE);

    console.log("Uploading roster chunk:", chunk.length);

    const { error } = await supabase
      .from("deputy_roster")
      .upsert(chunk, {
        onConflict: "roster_key",
      });

    if (error) throw new Error(JSON.stringify(error));
  }
}

// ----------------------
// MAIN SYNC
// ----------------------
async function sync() {
  try {
    console.log("📥 Starting sync...");

    await logStart("deputy-roster-sync");

    const buffer = await getExcelBuffer();

    let roster = parseDeputyRoster(buffer);

    roster = dedupe(roster, "roster_key");

    console.log("ROSTER ROWS:", roster.length);

    await uploadRoster(roster);

    await logSuccess(roster.length);

    console.log("🎉 Roster sync complete!");

  } catch (err) {
    console.error("💥 Sync failed:", err);
    await logFailure(err);
  }
}

sync();