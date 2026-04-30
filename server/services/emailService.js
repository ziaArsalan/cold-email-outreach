const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendEmail = async ({ to, subject, body }) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br/>'),
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};

// Test SMTP connection
const verifyConnection = async () => {
  const transporter = createTransporter();
  return await transporter.verify();
};

module.exports = { sendEmail, verifyConnection };
