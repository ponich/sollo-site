const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const command = process.argv[2];

async function callTelegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.description || `HTTP ${response.status}`);
  return body.result;
}

async function printChatIds() {
  const bot = await callTelegram('getMe');
  const updates = await callTelegram('getUpdates');
  const chats = new Map();
  for (const update of updates) {
    const message = update.message || update.channel_post || update.my_chat_member;
    const chat = message?.chat;
    if (chat) chats.set(chat.id, chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username);
  }
  if (chats.size === 0) {
    console.log(`Бот @${bot.username} ще не бачив жодного повідомлення.`);
    console.log('Напишіть йому будь-що в Telegram (або додайте в групу і напишіть там) і запустіть команду ще раз.');
    return;
  }
  console.log(`Чати, з яких писали боту @${bot.username}:`);
  for (const [id, name] of chats) console.log(`  TELEGRAM_CHAT_ID=${id}   ${name}`);
}

async function sendTest() {
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID не задано в .env');
  await callTelegram('sendMessage', { chat_id: chatId, text: 'СвітлоДім: тестове повідомлення. Заявки з сайту приходитимуть сюди.' });
  console.log('Тестове повідомлення надіслано.');
}

async function main() {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задано в .env');
  if (command === 'chat-id') return printChatIds();
  if (command === 'test') return sendTest();
  throw new Error('Команда: chat-id або test');
}

main().catch((error) => {
  console.error(`Помилка: ${error.message}`);
  process.exit(1);
});
