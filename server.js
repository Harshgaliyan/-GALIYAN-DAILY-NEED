require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit').rateLimit;
const nodemailer = require('nodemailer');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10kb' }));
app.use(express.static(__dirname));

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const cleanText = (value) => typeof value === 'string' ? value.trim() : '';

app.post('/api/contact', contactLimiter, async (request, response) => {
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body
        : {};
    const name = cleanText(body.name);
    const email = cleanText(body.email);
    const phone = cleanText(body.phone);
    const message = cleanText(body.message);
    const website = cleanText(body.website);

    if (website) return response.status(400).json({ error: 'Unable to submit this message.' });
    if (!name || name.length > 100 || !isValidEmail(email) || email.length > 254 ||
        phone.length > 30 || !message || message.length > 3000) {
        return response.status(400).json({ error: 'Please check the form fields and try again.' });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const sender = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPassword || !sender ||
        !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        return response.status(503).json({ error: 'Contact email is not configured yet. Please call +91 9897312151.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPassword }
        });
        await transporter.sendMail({
            from: sender,
            to: 'harshchaudhary20003@gmail.com',
            replyTo: email,
            subject: 'Website contact request',
            text: [
                `Name: ${name}`,
                `Email: ${email}`,
                `Phone: ${phone || 'Not provided'}`,
                '',
                'Message:',
                message
            ].join('\n')
        });
        return response.json({ success: true });
    } catch (error) {
        console.error('Contact email delivery failed:', error.message);
        return response.status(502).json({ error: 'We could not send your message right now. Please try again later.' });
    }
});

app.get('/health', (request, response) => response.json({ status: 'ok' }));

app.listen(port, () => {
    console.log(`GALIYAN site server listening on port ${port}`);
});
