require('dotenv').config();
const { Telegraf } = require('telegraf');
const connection = require('./db_config');
const caption = require('./caption');
const bot = new Telegraf(process.env.TOKEN);
const channelUsername = '@oromiyabankofficial';

function createInlineKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: ' Join Channel', url: 'https://t.me/oromiyabankofficial' }],
        [{ text: 'Continue ➡ ', callback_data: 'joined' }],
      ],
    },
  };
}

bot.start(async(ctx) => {
  console.log(ctx,'check');
  const userId = ctx.chat.id;
  const firstname = ctx.chat.first_name;
  const payload = ctx.message.text;
  const referringUserId = payload.split(' ')[1];
  console.log(referringUserId,'ref')
    //checking if there is referrer, if there is referrer register the user with the referrer id
  if (referringUserId) {
  registerUser(userId, firstname, referringUserId, ctx);
  } else {
    // register the user with out referrer 
    registerUser(userId, firstname, null, ctx);
  }
 });

bot.action('joined', async (ctx) => {
  const userId = ctx.from.id;
  const referringUserId = ctx.callbackQuery.from.id;

  handleChannelMembership(ctx, userId);
});



function handleChannelMembership(ctx, userId) {
  checkChannelMembershipAndHandle(ctx, userId);
}

function registerUser(userId, firstname, referringUserId, ctx) {
  const referralLink = `https://t.me/Oromia_bank_2024_bot?start=${userId}`;
  connection.query('SELECT * FROM users WHERE user_id = ?', [userId], (error, result) => {
    if (error) {
      console.log('error checking user availability in the database');
    }
    if (result.length > 0) {
      // console.log('user already registered');
      checkChannelMembershipAndHandle(ctx, userId, referringUserId);
    } else {
      connection.query(
        'INSERT INTO users (user_id, firstname, referral_link, referral_count, referred_by) VALUES (?,?,?,?,?)',
        [userId, firstname, referralLink, 0, referringUserId],
        (error) => {
          if (error) {
            console.log('error registering user:', error);
            ctx.reply('An error occurred while registering the user.');
          } else {
             if (referringUserId) {
              checkChannelMembershipAndHandle(ctx, userId, referringUserId).then(()=>{

                incrementReferralCount(referringUserId,userId);
              })

            }
          }
        }
      );
      
    }
  });
}

function incrementReferralCount(referringUserId,userId) {
  if(referringUserId !== userId){
     connection.query('UPDATE users SET referral_count = referral_count + 1 WHERE user_id = ?', [referringUserId], (error) => {
      if (error) {
        console.log('error incrementing referral count:', error);
      } else {
        console.log('referral count incremented successfully!');
      }
    });
  }
}

async function checkChannelMembershipAndHandle(ctx, userId, referringUserId) {
  try {
    const isChannelMember = await checkChannelMembership(ctx, userId);

    if (isChannelMember) {
      const userReferralLink = await getReferralLink(userId);
      const imageUrl = './assets/image1.jpg';
      const imageCaption = `${caption}${userReferralLink}`;

      await ctx.replyWithPhoto({ source: imageUrl }, { caption: imageCaption });

    } else {
      ctx.reply(`⚠ Please join our channel first and click  "continue" button:`, createInlineKeyboard());
    }
  } catch (error) {
    console.error('An error occurred:', error);
    ctx.reply('An error occurred while processing the request.');
  }
}


async function getReferralLink(userId) {
  const referralLink = `https://t.me/Oromia_bank_2024_bot?start=${userId}`;
   return referralLink;
}


function checkChannelMembership(ctx, userId) {
  return new Promise((resolve, reject) => {
    ctx.telegram
      .getChatMember(channelUsername, userId)
      .then((chatMember) => {
        const isMember = ['member', 'creator', 'administrator'].includes(chatMember.status);
        console.log('Is channel member:', isMember);
        resolve(isMember);
      })
      .catch((error) => {
        console.log('Error checking channel membership:', error);
        reject(error);
      });
  });
}





 




//////////////////// WINNER CHECKUP//////////////////////////////
async function sendWinnersToAdmin(userId, firstName, phoneNumber,referral_count) {
  const admin = '5990922922';

  try {
    // Check if the user is already in the 'payed' table
    const isUserPayed = await new Promise((resolve, reject) => {
      connection.query('SELECT * FROM payed WHERE user_id = ?', [userId], (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(rows.length > 0);
        }
      });
    });

    if (!isUserPayed) {
      // Generate a unique identifier for the callback data
      const uniqueId =  Date.now()

      // If user is not in 'payed' table, send the winner's information to the admin with a "Pay" button
      await bot.telegram.sendMessage(admin, `🥇Winner-> Name: ${firstName}  Phone Number: ${phoneNumber} referred persons: ${referral_count}`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Pay',
                callback_data: `pay_${uniqueId}_${firstName}_${phoneNumber}`,
              },
            ],
          ],
        },
      });
    }
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

// Function to handle the "Pay" button callback
async function handlePayButton(userId, firstName, phoneNumber, ctx) {
  try {
    // Check if the user is already in the 'payed' table
    const isUserPaid = await new Promise((resolve, reject) => {
      connection.query('SELECT * FROM payed WHERE user_id = ?', [userId], (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(rows.length > 0);
        }
      });
    });

    if (!isUserPaid) {
      // Insert the winner's information into the 'payed' table
      await new Promise((resolve, reject) => {
        connection.query('INSERT INTO payed (user_id, firstname, phone_number) VALUES (?, ?, ?)', [userId, firstName, phoneNumber], (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Update the referral_count value in the 'users' table to 0
      await new Promise((resolve, reject) => {
        connection.query('UPDATE users SET referral_count = 0 WHERE user_id = ?', [userId], (error) => {
          if (error) {
            reject(error);
            console.log(error,'error')
          } else {
            resolve();
          }
        });
      });

      // Send a confirmation message to the admin
      await ctx.answerCbQuery('✔ Payment processed.');
    } else {
      // If user is already in 'payed' table, inform the admin
      await ctx.answerCbQuery('User is already paid  .');
    }
  } catch (error) {
    console.error('An error occurred:', error);
    // Handle the error as needed
    await ctx.answerCbQuery('Error processing payment.');
  }
}


// Command to start the winners checking process
bot.command('checkwinners', async (ctx) => {
  try {
    const queryResult = await new Promise((resolve, reject) => {
      connection.query('SELECT user_id, firstname ,referral_count FROM users WHERE referral_count > 0', (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(rows);
        }
      });
    });

    for (const row of queryResult) {
      const userId = row.user_id;
      const firstName = row.firstname;
      const referral_count = row.referral_count;
      // Send inline keyboard to request phone number
      await bot.telegram.sendMessage(userId, `Congratulations! 🎉 🎉 🎉 you are one of this week winners . Please share your phone number 📱:`, {
        reply_markup: {
          keyboard: [
            [
              {
                text: 'Share Phone Number',
                request_contact: true,
              },
            ],
          ],
          resize_keyboard: true,
        },
      });

      // Listen for the user's response
      bot.on('contact', async (ctx) => {
        const userFirstName = ctx.message.from.first_name;
        const phoneNumber = ctx.message.contact.phone_number;

        // Send a thank you message to the user
        await ctx.reply(`Thank you, ${userFirstName}, for referring! The admin will contact you soon for the payment options.`);

        // Send winner information to admin with "Pay" button (check if not already in 'payed' table)
        await sendWinnersToAdmin(userId, userFirstName, phoneNumber, referral_count);
      });
    }

    ctx.reply('authorizing  potential winners. Waiting for their response...');
  } catch (error) {
    console.error('An error occurred:', error);
    // Handle the error as needed
  }
});

// Listen for callback queries (e.g., when the admin clicks the "Pay" button)
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data.split('_');
  console.log(callbackData)
  const action = callbackData[0];

  if (action === 'pay') {
    const userId = callbackData[1];
    const firstName = callbackData[2];
    const phoneNumber = callbackData[3];

    // Handle the "Pay" button callback
    await handlePayButton(userId, firstName, phoneNumber, ctx);
  }
});




bot.launch();