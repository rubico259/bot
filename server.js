const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 💡 הכנס כאן את המספר הקווי שלך בפורמט הבינלאומי (ללא פלוס או שטרודל)
const PHONE_NUMBER_FOR_PAIRING = "97231234567"; // <-- עדכן למספר שלך!

let pairingCodeDisplay = null;

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

// ==================== 1. API מקומי / ממשק דפדפן ====================

app.get('/', async (req, res) => {
    if (whatsappClient.info && whatsappClient.info.wid) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1 style="color: green;">✅ הבוט מחובר לוואטסאפ בהצלחה!</h1>
                <p>המערכת פעילה ומנהלת את התזכורות והעדכונים.</p>
            </html>
        `);
    }

    if (!pairingCodeDisplay) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1>⏳ הבוט מייצר קוד רישום למספר הקווי...</h1>
                <p>רענן את העמוד בעוד מספר שניות.</p>
            </html>
        `);
    }

    return res.send(`
        <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
            <h1>📞 חיבור מספר קווי לוואטסאפ ביזנס</h1>
            <p>השתמש בקוד הבא באפליקציית WhatsApp Business:</p>
            <div style="font-size: 48px; font-weight: bold; letter-spacing: 5px; color: #007bff; margin: 30px;">
                ${pairingCodeDisplay}
            </div>
            <p style="color: #666;">(הזן את הקוד תחת: קישור מכשיר -> קישור באמצעות מספר טלפון במקום)</p>
        </html>
    `);
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

// במקום סריקת QR, נבקש קוד רישום (Pairing Code) למספר קווי
whatsappClient.on('qr', async () => {
    try {
        console.log('מבקש קוד רישום (Pairing Code) עבור המספר הקווי...');
        const code = await whatsappClient.requestPairingCode(PHONE_NUMBER_FOR_PAIRING);
        pairingCodeDisplay = code;
        console.log(`\n========================================`);
        console.log(`🔗 קוד הרישום שלך לוואטסאפ הוא: ${code}`);
        console.log(`========================================\n`);
    } catch (err) {
        console.error('שגיאה בבקשת קוד רישום:', err);
    }
});

whatsappClient.on('ready', () => {
    console.log('הבוט מחובר בהצלחה ל-WhatsApp ומוכן לעבודה!');
    pairingCodeDisplay = "CONNECTED";
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