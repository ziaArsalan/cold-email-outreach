// Append one job row to the jobs Google Sheet. Reuses the JWT auth pattern
// from sheetsService.js. Column order A→K matches UPWORK-MONITOR.md.

const { google } = require('googleapis');
const config = require('../jobs/config');

const getSheetClient = () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
};

// A=Job Title B=Job Link C=Skills Required D=Client Country E=Client Rating
// F=Applicants G=Contact Name H=Contact Confidence I=Apply Link
// J=Personalised Cover Letter K=Date Found
const appendJobRow = async (job, coverLetter) => {
  const sheets = getSheetClient();
  const row = [
    job.title || '',
    job.url || '',
    (job.skills || []).join(', '),
    job.clientCountry || '',
    job.clientRating || '',
    job.applicants || '',
    job.contactName || '',
    job.contactConfidence || '',
    job.applyLink || job.url || '',
    coverLetter || '',
    new Date().toISOString(),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.JOBS_SHEET_ID,
    range: `${config.JOBS_TAB}!A:K`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
};

// Read all job rows from the jobs sheet (cols A→K). rowIndex is the 1-based
// spreadsheet row (header is row 1, so first data row is row 2).
const fetchJobRows = async () => {
  const sheets = getSheetClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: config.JOBS_SHEET_ID,
    range: `${config.JOBS_TAB}!A:K`,
  });

  const rows = data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1).map((row, i) => ({
    rowIndex: i + 2,
    title: row[0] || '',
    url: row[1] || '',
    skills: row[2] || '',
    clientCountry: row[3] || '',
    clientRating: row[4] || '',
    applicants: row[5] || '',
    contactName: row[6] || '',
    contactConfidence: row[7] || '',
    applyLink: row[8] || '',
    coverLetter: row[9] || '',
    dateFound: row[10] || '',
  }));
};

// Write a cover letter into column J for a given spreadsheet row.
const updateCoverLetter = async (rowIndex, text) => {
  const sheets = getSheetClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.JOBS_SHEET_ID,
    range: `${config.JOBS_TAB}!J${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[text]] },
  });
};

module.exports = { appendJobRow, fetchJobRows, updateCoverLetter };
