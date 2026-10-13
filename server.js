const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// משתנה זמני לשמירת קוד ה-QR האחרון
let latestQR = null;

// טעינת נתונים מקובץ הקונפיג
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

// ==================== 1. API מקומי ====================

// נתיב ראשי שמציג את קוד ה-QR כתמונה בדפדפן או הודעת סטטוס
app.get('/', async (req, res) => {
    if (whatsappClient.info && whatsappClient.info.wid) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1 style="color: green;">✅ הבוט מחובר לוואטסאפ בהצלחה!</h1>
                <p>המערכת פעילה ומנהלת את התזכורות והעדכונים.</p>
            </html>
        `);
    }

    if (!latestQR) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1>⏳ הבוט אתמול מנסה לייצר קוד QR...</h1>
                <p>רענן את העמוד בעוד מספר שניות.</p>
            </html>
        `);
    }

    try {
        // המרת מחרוזת ה-QR לתמונת PNG והצגתה בדפדפן
        const qrImageBuffer = await qrcode.toBuffer(latestQR);
        res.setHeader('Content-Type', 'image/png');
        res.send(qrImageBuffer);
    } catch (err) {
        res.status(500).send('שגיאה ביצירת קוד ה-QR');
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', message: 'Bot & API are running smoothly' });
});

app.get('/api/matchadchim', (req, res) => {
    const config = loadConfig();
    res.json(config.matchadchim);
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

whatsappClient.on('qr', (qr) => {
    latestQR = qr;
    console.log('נוצר קוד QR חדש! ניתן לצפות בו בכתובת האתר שלך (Root URL).');
});

whatsappClient.on('ready', () => {
    console.log('הבוט מחובר בהצלחה ל-WhatsApp ומוכן לעבודה!');
    latestQR = null; // איפוס הקוד לאחר התחברות מוצלחת
    startAutomatedReminders();
});

// האזנה להודעות נכנסות מהמשודכים
whatsappClient.on('message', async (msg) => {
    if (msg.from.endsWith('@g.us')) return; // להתעלם מקבוצות

    const config = loadConfig();
    const senderPhone = msg.from;
    const updateText = msg.body.trim();

    const matched = config.matchadchim.find(m => m.phone === senderPhone);

    if (matched) {
        console.log(`התקבל עדכון ממשודך ${matched.name}: ${updateText}`);

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
            await whatsappClient.sendMessage(config.shadchanNumber, forwardMessage);
            await msg.reply('תודה רבה! העדכון הועבר בהצלחה לשדכן.');
        } catch (err) {
            console.error('שגיאה בשליחת ההודעה לשדכן:', err);
        }
    }
});

// תזכורות אוטומטיות
function startAutomatedReminders() {
    const config = loadConfig();
    const intervalHours = config.reminderIntervalHours || 24;
    
    console.log(`מערכת התזכורות הופעלה (תשלח תזכורת כל ${intervalHours} שעות).`);

    setInterval(async () => {
        const currentConfig = loadConfig();
        console.log('שולח תזכורות אוטומטיות למשודכים...');
        
        for (const m of currentConfig.matchadchim) {
            try {
                await whatsappClient.sendMessage(m.phone, `שלום ${m.name}, זוהי תזכורת אוטומטית לעדכן את הסטטוס שלך עבור השדכן. אנא השיבו להודעה זו.`);
                console.log(`נשלחה תזכורת אל: ${m.name}`);
            } catch (e) {
                console.error(`שגיאה בשליחה אל ${m.name}:`, e);
            }
        }
    }, intervalHours * 60 * 60 * 1000);
}

whatsappClient.initialize();