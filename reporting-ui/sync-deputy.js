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
    `/items/${process.env.FILE_ID}`;

  const meta = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const downloadUrl = meta.data["@microsoft.graph.downloadUrl"];

  console.log("📥 Downloading Excel file...");

  const file = await axios.get(downloadUrl, {
    responseType: "arraybuffer",
  });

  return file.data;
}

// ----------------------
// PARSE DEPUTY
// ----------------------
function parseDeputyData(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = getSheet(workbook, ["DeputyRawData"]);

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log("Raw rows:", rows.length);

let skipped = 0;

const filtered = rows.slice(1).filter((r, i) => {
  if (!r || !r[0]) {
    skipped++;

    console.log(
      "Skipped row",
      i + 2,
      JSON.stringify(r)
    );

    return false;
  }

  return true;
});

console.log("Skipped rows:", skipped);
console.log("Rows after filter:", filtered.length);

return filtered.map(r => ({
  shift_key: `${r[0]}_${r[2]}_${r[3]}_${r[4]}`,

  employee_name: r[0],
  level: String(r[1] || ""),

  shift_date: excelDateToJS(r[2]),
  start_time: excelTimeToString(r[3]),
  end_time: excelTimeToString(r[4]),
  meal_break: excelTimeToString(r[5]),

  total_hours: Number(r[6]) || 0,
  total_cost: Number(r[7]) || 0,

  employee_comment: r[8] || null,
  hourly_rate: Number(r[9]) || 0,

  area_name: String(r[10] || "").trim(),

  comment: r[11] || null,
  day_name: r[12] || null,
  month_name: r[13] || null,
  week: r[14] == null || r[14] === "" ? 0 : Number(r[14]),
  source_file: "DeputyRawData",
}));
}

// ----------------------
// PARSE TT (FIXED)
// ----------------------
function parseTTData(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = getSheet(workbook, ["TTRawData"]);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return rows
    .slice(1)
    .filter(r => r && r.length)
    .map(r => ({
      game_key: `${r[0]}_${r[3]}_${r[4]}`,

      // 🔥 FIX HERE
      Date: excelDateToJS(r[0]),

      Competition: r[1] || null,
      Round: r[2] || null,

      home_team: r[3] || null,
      away_team: r[4] || null,

      home_allocated: r[5] || null,
      away_allocated: r[6] || null,

      Location: r[7] || null,
      Additional: r[8] || null,
      Week: r[9] == null || r[9] === "" ? 0 : Number(r[9]),
      Column11: r[10] || null
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
async function uploadToSupabase(records) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    console.log("Uploading Deputy chunk:", chunk.length);

    const { error } = await supabase
      .from("deputy_shifts")
      .upsert(chunk, { onConflict: "shift_key" });

    if (error) throw new Error(JSON.stringify(error));
  }
}

// ----------------------
// UPLOAD TT
// ----------------------
async function uploadTT(records) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    console.log("Uploading TT chunk:", chunk.length);

    const { error } = await supabase
      .from("TT_Games")
      .upsert(chunk, { onConflict: "game_key" });

    if (error) throw new Error(JSON.stringify(error));
  }
}

// ----------------------
// MAIN SYNC
// ----------------------
async function sync() {
  try {
    console.log("📥 Starting sync...");

    await logStart("excel-sync");

    const buffer = await getExcelBuffer();

    // ----------------------
    // DEPUTY
    // ----------------------
    let deputy = parseDeputyData(buffer);
    deputy = dedupe(deputy, "shift_key");

    console.log("DEPUTY ROWS:", deputy.length);

    // ----------------------
    // TT (FIXED)
    // ----------------------
    let tt = parseTTData(buffer);
    tt = dedupe(tt, "game_key");

    console.log("TT ROWS:", tt.length);

    // ----------------------
    // UPLOAD
    // ----------------------
    await uploadToSupabase(deputy);
    await uploadTT(tt);

    await logSuccess(deputy.length + tt.length);

    console.log("🎉 Sync complete!");
  } catch (err) {
    console.error("💥 Sync failed:", err);
    await logFailure(err);
  }
}

sync();