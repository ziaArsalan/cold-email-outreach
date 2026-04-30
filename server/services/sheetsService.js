const { google } = require('googleapis');

const getSheetClient = () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
};

// Parse a row array into a lead object
// Columns: A=Email, B=Name, C=Business, D=Website, E=Status, F=Reference, G=GeneratedEmail
const parseRow = (row, index) => {
  let generatedEmail = null;
  if (row[6]) {
    try { generatedEmail = JSON.parse(row[6]); } catch (_) {}
  }
  return {
    rowIndex: index + 2,
    email: row[0] || '',
    name: row[1] || '',
    business: row[2] || '',
    website: row[3] || '',
    status: row[4] || '',
    reference: row[5] || '',
    generatedEmail, // { subject, body } or null
  };
};

// Fetch all rows where Status is empty (not yet emailed)
const fetchPendingLeads = async () => {
  const sheets = getSheetClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A:G',
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1)
    .map((row, index) => parseRow(row, index))
    .filter((lead) => lead.email && (!lead.status || lead.status.trim() === ''));
};

// Fetch all rows (for dashboard display)
const fetchAllLeads = async () => {
  const sheets = getSheetClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A:G',
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1).map((row, index) => parseRow(row, index));
};

// Update the Status column (E) to "Emailed" for a given row
const updateLeadStatus = async (rowIndex, status = 'Emailed') => {
  const sheets = getSheetClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Sheet1!E${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  });
};

// Save generated email JSON to column G — called once, reused forever
const saveGeneratedEmail = async (rowIndex, emailData) => {
  const sheets = getSheetClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Sheet1!G${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[JSON.stringify(emailData)]] },
  });
};

module.exports = { fetchPendingLeads, fetchAllLeads, updateLeadStatus, saveGeneratedEmail };
