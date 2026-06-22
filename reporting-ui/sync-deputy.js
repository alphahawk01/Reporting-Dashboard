require("axios");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// ----------------------
// ENV SAFETY (CI vs local)
// ----------------------
if (process.env.CI !== "true") {
  require("dotenv").config();
}

// ----------------------
// REQUIRED ENV CHECK
// ----------------------
const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "SITE_ID",
  "DRIVE_ID",
  "FILE_ID",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`❌ Missing env var: ${key}`);
  }
}

// ----------------------
// SUPABASE CLIENT
// ----------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CHUNK_SIZE = 500;

// ----------------------
// GRAPH AUTH
// ----------------------
async function getToken() {
  const axios = require("axios");

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
  const axios = require("axios");

  const token = await getToken();

  const metaUrl =
    `https://graph.microsoft.com/v1.0/sites/${process.env.SITE_ID}` +
    `/drives/${process.env.DRIVE_ID}` +
    `/items/${process.env.FILE_ID}`;

  const meta = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const downloadUrl = meta.data["@microsoft.graph.downloadUrl"];

  if (!downloadUrl) {
    throw new Error("❌ No download URL returned from Graph API");
  }

  console.log("📥 Downloading Excel file...");

  const file = await axios.get(downloadUrl, {
    responseType: "arraybuffer",
  });

  return file.data;
}

// ----------------------
// HELPERS
// ----------------------
function excelTimeToString(value) {
  if (value === null || value === undefined || value === "") return null;

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

  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;

  return new Date(utcValue * 1000).toISOString().split("T")[0];
}

// ----------------------
// SHEET PICKER
// ----------------------
function getSheet(workbook, possibleNames) {
  const found = workbook.SheetNames.find(name =>
    possibleNames.some(p => name.toLowerCase().includes(p.toLowerCase()))
  );

  if (!found) {
    throw new Error(
      `Sheet not found. Expected: ${possibleNames.join(
        ", "
      )} | Found: ${workbook.SheetNames.join(", ")}`
    );
  }

  return workbook.Sheets[found];
}

// ----------------------
// PARSE DEPUTY
// ----------------------
function parseDeputyData(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  console.log("📑 Sheets found:", workbook.SheetNames);

  const sheet = getSheet(workbook, ["DeputyRawData"]);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return rows
    .slice(1)
    .filter(r => r && r[0])
    .map(r => {
      const employee = r[0];
      const date = r[2];

      const start = excelTimeToString(r[3]);
      const end = excelTimeToString(r[4]);

      return {
        shift_key: `${employee}_${date}_${start}_${end}`,

        employee_name: employee,
        level: String(r[1] || ""),

        shift_date: excelDateToJS(date),

        start_time: start,
        end_time: end,
        meal_break: excelTimeToString(r[5]),

        total_hours: Number(r[6]) || 0,
        total_cost: Number(r[7]) || 0,

        employee_comment: r[8] || null,
        hourly_rate: Number(r[9]) || 0,

        area_name: r[10] || null,
        comment: r[11] || null,

        day_name: r[12] || null,
        month_name: r[13] || null,

        week: r[14] ?? null,

        source_file: "DeputyRawData",
      };
    });
}

// ----------------------
// PARSE TT
// ----------------------
function parseTTData(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheet = getSheet(workbook, ["TTRawData"]);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return rows
    .slice(1)
    .filter(r => r && r[0])
    .map(r => ({
      game_key: [
        excelDateToJS(r[0]),
        r[1],
        r[2],
        r[3],
        r[4],
      ].join("|"),

      Date: excelDateToJS(r[0]),
      Competition: r[1],
      Round: r[2],

      home_team: r[3],
      away_team: r[4],

      home_allocated: r[5],
      away_allocated: r[6],

      Location: r[7],
      Additional: r[8],
      Week: r[9],
      Column11: r[10],
    }));
}

// ----------------------
// DEDUPE
// ----------------------
function dedupe(records) {
  const map = new Map();

  for (const r of records) {
    map.set(r.shift_key, r);
  }

  return [...map.values()];
}

// ----------------------
// SUPABASE UPLOAD
// ----------------------
async function uploadToSupabase(records) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    const { error } = await supabase
      .from("deputy_shifts")
      .upsert(chunk, {
        onConflict: "shift_key",
      });

    if (error) throw new Error(JSON.stringify(error));

    console.log(
      `✅ Synced ${Math.min(i + CHUNK_SIZE, records.length)}/${records.length}`
    );
  }
}

async function uploadTT(records) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    const { error } = await supabase
      .from("TT_Games")
      .upsert(chunk, {
        onConflict: "game_key",
      });

    if (error) throw new Error(JSON.stringify(error));

    console.log(
      `✅ TT Synced ${Math.min(i + CHUNK_SIZE, records.length)}/${records.length}`
    );
  }
}

// ----------------------
// MAIN
// ----------------------
async function sync() {
  try {
    console.log("📥 Starting sync...");

    const buffer = await getExcelBuffer();

    // ----------------------
    // DEPUTY
    // ----------------------
    console.log("📊 Parsing DeputyRawData...");
    let deputy = parseDeputyData(buffer);

    console.log(`📦 Parsed ${deputy.length} rows`);

    console.log("🧹 Deduplicating...");
    deputy = dedupe(deputy);

    console.log(`📦 After dedupe: ${deputy.length}`);

    console.log("🚀 Uploading Deputy...");
    await uploadToSupabase(deputy);

    // ----------------------
    // TT
    // ----------------------
    console.log("📊 Parsing TTRawData...");
    const tt = parseTTData(buffer);

    console.log(`📦 Parsed TT rows: ${tt.length}`);

    console.log("🚀 Uploading TT...");
    await uploadTT(tt);

    console.log("🎉 Sync complete!");
  } catch (err) {
    console.error("💥 Sync failed:");
    console.error(err.message || err);
  }
}

sync();