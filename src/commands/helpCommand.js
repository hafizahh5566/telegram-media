/**
 * Help Command
 * Display all available commands
 */

const Logger = require('../utils/logger');
const { getHelpKeyboard } = require('../utils/keyboards');

/**
 * Handle /help command
 * @param {Object} ctx - Telegraf context
 */
async function handleHelpCommand(ctx) {
  try {
    Logger.info('Help command received');
    
    const helpMessage = `
📚 *Telegram Media Storage Bot*

*🚀 NEW: Bulk Forward Mode*
Forward ribuan media dari channel lain!
• Otomatis detect forwarded messages
• Auto-category dari hashtag (#promo → promo)
• Duplicate detection (skip file sama)
• Progress tracking real-time

*Available Commands:*

📤 *Upload Media*
Just send me any video, photo, document, or animation!
I'll automatically save it and give you an ID.

📋 */list*
Show the latest 20 stored media

🔍 */search* \`<keyword>\`
Search media by caption
Example: \`/search funny cat\`

📨 */send* \`<media_id> <chat_id>\`
Send stored media to a chat or channel
Example: \`/send 15 -1001234567890\`

📦 */bulksend* \`<media_ids> <chat_id>\`
Send multiple media at once to a chat or channel
Examples:
• \`/bulksend 1,2,3 -1001234567890\`
• \`/bulksend 1-5 -1001234567890\`
• \`/bulksend 1,3,5-8 -1001234567890\`

🚀 */bulkmode*
Info & status bulk forward mode
Forward dari channel lain untuk import ribuan file!

📋 */forum* \`<category> <group_id>\`
Send category to Telegram Forum Group (with topics)
• Auto-creates topic for each category
• Requires topics enabled in group
Example: \`/forum Movies -1001234567890\`

🗑 */delete* \`<media_name>\`
Delete media record from database
Example: \`/delete promo_video\`

📂 */categories*
List all available categories

📂 */listcat* \`<category>\`
List all media inside a category
Example: \`/listcat video_ads\`

🗑 */deletecat* \`<category> <media_name>\`
Delete a specific media from a category by name
Example: \`/deletecat video_ads promo_video\`

🏷 */setcat* \`<media_id> <category>\`
Move a media to a different category
Example: \`/setcat 15 video_ads\`

📊 */count*
Show total number of stored media

❓ */help*
Show this help message

*💡 Bulk Forward Tips:*
• Forward dari channel → Auto batch process
• Gunakan hashtag (#sales, #promo) untuk auto-category
• Bot skip duplicate files otomatis
• Update progress setiap 50 files

*How to get Chat ID:*
• For channels/groups: Use @userinfobot
• Add the bot to your channel/group
• Make sure the bot has permission to post

*Supported Media Types:*
✅ Video
✅ Photo
✅ Document
✅ Animation (GIF)
`;
    
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      ...getHelpKeyboard()
    });
  } catch (error) {
    Logger.error('Error in help command', error);
    await ctx.reply('❌ An error occurred while displaying help');
  }
}

module.exports = handleHelpCommand;
