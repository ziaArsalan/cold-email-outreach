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

module.exports = { appendJobRow };
