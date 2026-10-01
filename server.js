require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const port = Number(process.env.PORT) || 3000;
const ownerEmail = 'dhinabalu12@gmail.com';
const servicePrices = {
  Haircut: 120,
  'Shaving / Beard': 70
};

app.use(express.json({ limit: '10kb' }));

const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/api/owner-notification', notificationLimiter, async (request, response) => {
  const {
    customerName,
    ticketId,
    bookingDate,
    numberOfTickets,
    totalAmount,
    service,
    bookingTime
  } = request.body || {};
  const normalizedName = typeof customerName === 'string' ? customerName.trim().replace(/\s+/g, ' ') : '';
  const ticketCount = Number(numberOfTickets);
  const safeDate = typeof bookingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)
    ? new Date(`${bookingDate}T12:00:00.000Z`)
    : null;
  const validDate = safeDate && !Number.isNaN(safeDate.getTime()) && safeDate.toISOString().slice(0, 10) === bookingDate;
  const validTime = typeof bookingTime === 'string' && /^(09|1\d):(00|30)$/.test(bookingTime) && bookingTime <= '19:30';

  if (
    !normalizedName || normalizedName.length > 60 ||
    typeof ticketId !== 'string' || !/^MS-\d{8}-[A-Z0-9]{1,8}$/.test(ticketId) ||
    !validDate || !validTime ||
    !Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > 10 ||
    !Object.hasOwn(servicePrices, service) ||
    Number(totalAmount) !== servicePrices[service] * ticketCount
  ) {
    return response.status(400).json({ error: 'Invalid booking notification details.' });
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    return response.status(503).json({ error: 'Email notifications are not configured on the server.' });
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: smtpUser, pass: smtpPass }
  });
  const dateLabel = safeDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
  const amount = servicePrices[service] * ticketCount;

  try {
    await transporter.sendMail({
      from: `Madras Saloon bookings <${smtpUser}>`,
      to: ownerEmail,
      subject: `New booking · ${ticketId}`,
      text: [
        'A new booking was completed at Madras Saloon.',
        '',
        `Customer: ${normalizedName}`,
        `Ticket ID: ${ticketId}`,
        `Booking date: ${dateLabel}`,
        `Booking time: ${bookingTime}`,
        `Service: ${service}`,
        `Number of tickets: ${ticketCount}`,
        `Total amount: INR ${amount}`,
        '',
        'Payment status: demo simulation only; no real charge was made.'
      ].join('\n')
    });
    return response.json({ sent: true });
  } catch (error) {
    console.error('Owner booking email failed:', error.message);
    return response.status(502).json({ error: 'The booking email could not be sent.' });
  }
});

app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Madras Saloon is running at http://localhost:${port}`);
});