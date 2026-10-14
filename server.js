const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ב-Render הוא יקבל את הפורט שהם מקצים (כמו 10000), ומקומית ירוץ על 3000
const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

let qrCodeDataUrl = null;
let isConnected = false;

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('שגיאה: קובץ config.json לא נמצא!');
        // בקונפיגורציה בסיסית אם אין קובץ בענן נרצה ברירת מחדל, אבל אצלך הוא קיים בגיטהאב
        return {
            "pairingPhoneNumber": "97286755126",
            "shadchanNumber": "972556637160@c.us",
            "reminderTime": "12:00",
            "matchadchim": [{"name": "ראובן", "phone": "972544502160@c.us"}],
            "updates": []
        };
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(configData) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
}

// ==================== ממשק דפדפן ====================
app.get('/', async (req, res) => {
    if (isConnected) {
        return res.send(`
            <html dir="rtl" style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1 style="color: green;">✅ הבוט מחובר לוואטסאפ בהצלחה בענן!</h1>
                <p>המערכת פעילה, מקשיבה להודעות ושולחת תזכורות.</p>
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

// ==================== הבוט של וואטסאפ ====================
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        // בודק האם יש נתיב מוגדר לענן, ואם לא לוקח את ברירת המחדל
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'
    }
});

whatsappClient.on('qr', async (qr) => {
    console.log('נוצר קוד QR חדש לסריקה.');
    qrCodeDataUrl = await qrcode.toDataURL(qr);
});

whatsappClient.on('ready', () => {
    isConnected = true;
    qrCodeDataUrl = null;
    console.log('הבוט מחובר בהצלחה ל-WhatsApp ומוכן לעבודה בענן!');
    startReminderScheduler();
});

whatsappClient.on('auth_failure', msg => {
    console.error('שגיאת אימות (Auth Failure):', msg);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('הבוט התנתק:', reason);
    isConnected = false;
});

// האזנה להודעות
whatsappClient.on('message', async (msg) => {
    console.log(`📥 התקבלה הודעה חדשה! מתוך: ${msg.from} | author: ${msg.author || 'N/A'} | תוכן: ${msg.body}`);

    if (msg.from.endsWith('@g.us')) return;

    const config = loadConfig();
    const updateText = msg.body.trim();
    let senderPhone = msg.from;
    if (msg.author) {
        senderPhone = msg.author;
    }

    const isFromMatchadach = true; 

    if (isFromMatchadach) {
        const matched = config.matchadchim[0]; 
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
        console.log(`⚠️ המספר אינו מופיע ברשימת המשודכים המורשים.`);
    }
});

// ==================== מנגנון תזכורות יומיות ====================
function startReminderScheduler() {
    console.log('⏰ מנגנון התזכורות היומיות הופעל ברקע בענן.');
    
    setInterval(async () => {
        if (!isConnected) return;

        const config = loadConfig();
        const targetTime = config.reminderTime || "12:00";
        
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        if (currentTime === targetTime) {
            console.log(`⏰ הגענו לשעת התזכורת המוגדרת (${targetTime}). שולח תזכורות למשודכים...`);

            for (const matchadach of config.matchadchim) {
                const reminderText = `שלום ${matchadach.name}, מה שלומך? 🌸\nזוהי תזכורת יומית מטעם הבוט האם יש לך עדכון חדש להעביר לשדכן להיום? מוזמן לענות לי בהודעה זו.`;
                
                try {
                    let targetPhone = matchadach.phone;
                    await whatsappClient.sendMessage(targetPhone, reminderText);
                    console.log(`📤 נשלחה תזכורת יומית בהצלחה אל: ${matchadach.name} (${targetPhone})`);
                } catch (err) {
                    console.error(`❌ שגיאה בשליחת תזכורת אל ${matchadach.name}:`, err);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 70000));
        }
    }, 60000);
}

whatsappClient.initialize();