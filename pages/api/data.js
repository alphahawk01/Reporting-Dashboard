import * as XLSX from "xlsx";

export default async function handler(req, res) {
  try {
    console.log("STEP 1: Getting token");

    // 1. Get access token
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID,
          client_secret: process.env.AZURE_CLIENT_SECRET,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.log("TOKEN ERROR:", tokenData);
      return res.status(500).json(tokenData);
    }

    console.log("STEP 2: Token OK");

    // 2. Get file metadata (USING USER DRIVE)
    const metaRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${process.env.USER_ID}/drive/items/${process.env.EXCEL_FILE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const meta = await metaRes.json();

    console.log("STEP 3: Meta response received");

    if (!meta["@microsoft.graph.downloadUrl"]) {
      console.log("META ERROR:", meta);

      return res.status(500).json({
        error: "downloadUrl missing from Graph response",
        meta,
      });
    }

    // 3. Download file
    const fileRes = await fetch(meta["@microsoft.graph.downloadUrl"]);

    if (!fileRes.ok) {
      console.log("DOWNLOAD ERROR:", fileRes.status);

      return res.status(500).json({
        error: "Failed to download file",
        status: fileRes.status,
      });
    }

    console.log("STEP 4: File downloaded");

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // 4. Parse Excel
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(404).json({ error: "No sheets found in workbook" });
    }

    console.log("SHEETS:", workbook.SheetNames);

    // 5. Use first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return res.status(404).json({
        error: "Sheet not found",
        sheetName,
      });
    }

    // 6. Convert to rows
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    console.log("STEP 5: Rows parsed");

    // 7. Return data
    return res.status(200).json({
      sheet: sheetName,
      rows,
    });

  } catch (err) {
    console.error("API CRASH:", err);

    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
}