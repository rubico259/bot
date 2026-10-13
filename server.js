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
                <p>המערכת פעילה ומנהלת את התזכורות והעדכונים.</p>
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

app.get('/api/status', (req, res) => {
    res.json({ status: isConnected ? 'Online' : 'Connecting' });
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
    startAutomatedReminders();
});

whatsappClient.on('auth_failure', msg => {
    console.error('שגיאת אימות (Auth Failure):', msg);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('הבוט התנתק:', reason);
    isConnected = false;
});

// האזנה להודעות נכנסות מהמשודכים
whatsappClient.on('message', async (msg) => {
    if (msg.from.endsWith('@g.us')) return;

    const config = loadConfig();
    const senderPhone = msg.from;
    const updateText = msg.body.trim();

    const matched = config.matchadchim.find(m => m.phone === senderPhone || m.phone + '@c.us' === senderPhone);

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
            console.log('ההודעה הועברה לשדכן בהצלחה!');
        } catch (err) {
            console.error('שגיאה בשליחת ההודעה לשדכן:', err);
        }
    }
});

// תזכורות אוטומטיות
function startAutomatedReminders() {
    const config = loadConfig();
    const intervalHours = config.reminderIntervalHours || 24;
    
    setInterval(async () => {
        const currentConfig = loadConfig();
        for (const m of currentConfig.matchadchim) {
            try {
                const target = m.phone.includes('@c.us') ? m.phone : m.phone + '@c.us';
                await whatsappClient.sendMessage(target, `שלום ${m.name}, זוהי תזכורת אוטומטית לעדכן את הסטטוס שלך עבור השדכן.`);
            } catch (e) {
                console.error(`שגיאה בשליחה אל ${m.name}:`, e);
            }
        }
    }, intervalHours * 60 * 60 * 1000);
}

whatsappClient.initialize();