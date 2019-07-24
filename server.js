// --------------------------------------------------------
// サーバーの処理
// --------------------------------------------------------
const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/views/index.html');
});
http.listen(process.env.PORT, function() {
  log('result', `listening on *:${process.env.PORT}`, '');
});
io.on('connection', function(socket) {
  socket.on('last message', function(msg) {
    const opt = {
      'status': 'result',
      'message': msg,
      'data': '',
      'date': whatTimeIsIt().replace(/-/g, '/').replace(/T/g, ' ').replace(/\+.+/g, '')
    };
    io.emit('catch message', opt);
    io.emit('catch message', lastLog);
  });
  socket.on('check message', function(msg) {
    postJson(msg)
  });
});
// --------------------------------------------------------
// Discordの処理
// --------------------------------------------------------
const request = require('request');
const fs = require('fs');
const Discord = require('discord.js');
const client = new Discord.Client({sync: true});
const setting = {
  'guildId': process.env.DISCORD_GUILDID,
  'token': process.env.DISCORD_TOKEN,
  'url': process.env.DISCORD_URL,
};
let lastStatus = 'offline'; // ステータスを保持しておく
let lastLog; 
if (!setting.guildId.length || !setting.token.length || !setting.url.length) {
  log('error', '設定が記載されていないため、処理を終了します。', '');
  process.exit(1);
}
// ログイン
client.login(setting.token)
  .then((res) => {
    lastStatus = client.user.settings.status;
    client.user.setStatus(lastStatus);
  }).catch((error) => {
    log('error', 'ログイン失敗', error);
  });
// ログイン成功後
client.on('ready', () => {
  log('result', 'ログイン成功', client.user.tag);
  setTimeout(postJson.bind(null, '初回処理'), 1000 * 10); // 10秒後に取得
  setInterval(postJson.bind(null, '定期処理'), 1000 * 60 * 60); // 1時間ごとに取得
});
// ルールの追加、削除、ニックネームの変更で起きるイベント
client.on('guildMemberUpdate', (oldMember, newMember) => {
  const guildId = oldMember.guild.id;
  const userId = oldMember.user.id;
  const username = oldMember.user.username;
  const oldNickname = oldMember.nickname;
  const newNickname = newMember.nickname;
  if (setting.guildId == guildId && oldNickname != newNickname)
    postJson(`${username}(${userId})が「${oldNickname}」から「${newNickname}」に変更`);
});
// ステータスの変更で起きるイベント
client.on('clientUserSettingsUpdate', (ClientUserSettings) => {
  const status = ClientUserSettings.status;
  if (lastStatus === status) return;
  lastStatus = status;
  client.user.setStatus(status)
    .catch((error) => {
      log('error', 'ステータス変更時にエラーが発生しました', error);
    });
});

function postJson(message) {
  log('result', message, '');
  const guildObj = {};
  const emojiObj = {};
  const guilds = client.guilds.get(setting.guildId);
  if (guilds == null) log('error', `ID(${setting.guildId})は存在しません`, guilds);
  guilds.members.map((value, key) => {
    guildObj[key] = {};
    guildObj[key].username = value.user.username
    guildObj[key].nickname = (value.nickname == null) ? value.user.username : value.nickname;
    guildObj[key].avatarURL = value.user.displayAvatarURL.replace(/\?size=\d+/, '');
  });
  guilds.emojis.map((value, key) => {
    emojiObj[key] = {};
    emojiObj[key].name = value.name;
    emojiObj[key].url = value.url;
  });
  const options = {
    uri: setting.url,
    headers: {
      'Content-type': 'application/json'
    },
    json: {
      'date': whatTimeIsIt(),
      'members': guildObj,
      'emojis': emojiObj
    }
  };
  request.post(options, function(err, response, body) {
    if (err != null) {
      log('error', '送信失敗', err);
      setTimeout(postJson.bind(null, 'リトライ'), 1000 * 60 * 5);
    } else {
      log('result', '送信成功', body);
    }
  });
}

function whatTimeIsIt() {
  const serverDate = new Date();
  const time = new Date();
  time.setHours(serverDate.getHours() + 9); // UTCなので+9hする
  const Y = time.getFullYear();
  const M = toDoubleDigits(time.getMonth() + 1);
  const D = toDoubleDigits(time.getDate());
  const h = toDoubleDigits(time.getHours());
  const m = toDoubleDigits(time.getMinutes());
  const s = toDoubleDigits(time.getSeconds());
  return `${Y}-${M}-${D}T${h}:${m}:${s}+09:00`; // 2022-05-29T22:11:10+09:00
}

function toDoubleDigits(num) {
  const str = String(num);
  if (str.length === 1) return `0${str}`;
  return str;
}

function log(status, message, data) {
  const time = whatTimeIsIt().replace(/-/g, '/').replace(/T/g, ' ').replace(/\+.+/g, '');
  const opt = {
    'status': status,
    'message': message,
    'data': data,
    'date': time
  };
  console.log(`[${status}] ${time} ${message}`, data);
  io.emit('catch message', opt);
  lastLog = opt;
};
