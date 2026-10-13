const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

let qrCodeDataUrl = null;
let isConnected = false;

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('שגיאה: קובץ config.json לא נמצא!');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(configData) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
}

// ==================== 1. API מקומי / ממשק דפדפן ====================

app.get('/', async (req, res) => {
    if (isConnected) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1 style="color: green;">✅ הבוט מחובר לוואטסאפ בהצלחה!</h1>
                <p>המערכת פעילה ומנהלת את העדכונים.</p>
            </html>
        `);
    }

    if (!qrCodeDataUrl) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1>⏳ מייצר קוד QR לחיבור...</h1>
                <p>רענן את העמוד בעוד מספר שניות.</p>
            </html>
        `);
    }

    return res.send(`
        <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
            <h1>📞 סרוק את קוד ה-QR כדי לחבר את הבוט</h1>
            <p>פתח את וואטסאפ בטלפון -> מכשירים מקושרים -> קישור מכשיר -> סרוק את הקוד:</p>
            <div style="margin: 30px;">
                <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 250px; height: 250px;" />
            </div>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`API Server is running on port ${PORT}`);
});

// ==================== 2. הבוט של וואטסאפ ====================
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: '/usr/bin/chromium'
    }
});

whatsappClient.on('qr', async (qr) => {
    console.log('נוצר קוד QR חדש לסריקה.');
    qrCodeDataUrl = await qrcode.toDataURL(qr);
});

whatsappClient.on('ready', () => {
    isConnected = true;
    qrCodeDataUrl = null;
    console.log('הבוט מחובר בהצלחה ל-WhatsApp ומוכן לעבודה!');
});

whatsappClient.on('auth_failure', msg => {
    console.error('שגיאת אימות (Auth Failure):', msg);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('הבוט התנתק:', reason);
    isConnected = false;
});

// האזנה גורפת לכל הודעה שנכנסת למערכת כדי לבדוק מה הבוט "רואה"
whatsappClient.on('message', async (msg) => {
    console.log(`📥 התקבלה הודעה חדשה! מתוך: ${msg.from} | תוכן: ${msg.body}`);

    if (msg.from.endsWith('@g.us')) return; // התעלמות מקבוצות

    const config = loadConfig();
    const senderPhone = msg.from; // לדוגמה: 972544502160@c.us
    const updateText = msg.body.trim();

    // בדיקה גמישה יותר למציאת המשודך (גם אם יש או אין `@c.us`)
    const matched = config.matchadchim.find(m => {
        const cleanConfigPhone = m.phone.replace('@c.us', '');
        const cleanSenderPhone = senderPhone.replace('@c.us', '');
        return cleanConfigPhone === cleanSenderPhone;
    });

    if (matched) {
        console.log(`✅ המשודך זוהה בהצלחה: ${matched.name}`);

        const newUpdate = {
            name: matched.name,
            phone: senderPhone,
            text: updateText,
            timestamp: new Date().toISOString()
        };
        
        if (!config.updates) config.updates = [];
        config.updates.push(newUpdate);
        saveConfig(config);

        const forwardMessage = `🔔 *עדכון סטטוס חדש*\n👤 מאת: ${matched.name}\n\n💬 תוכן העדכון:\n${updateText}`;
        
        try {
            console.log(`📤 מנסה לשלוח את ההודעה לשדכן: ${config.shadchanNumber}`);
            await whatsappClient.sendMessage(config.shadchanNumber, forwardMessage);
            await msg.reply('תודה רבה! העדכון הועבר בהצלחה לשדכן.');
            console.log('✨ ההודעה הועברה לשדכן בהצלחה!');
        } catch (err) {
            console.error('❌ שגיאה בשליחת ההודעה לשדכן:', err);
        }
    } else {
        console.log(`⚠️ המספר ${senderPhone} אינו מופיע ברשימת המשודכים המורשים בקובץ הקונפיגורציה.`);
    }
});

whatsappClient.initialize();