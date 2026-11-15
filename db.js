const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'audio');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SURVEYS_FILE = path.join(DATA_DIR, 'surveys.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');

function readJson(file, defaultValue = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const data = fs.readFileSync(file, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return defaultValue;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

// Generate short random code
function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Initialize seed data
function initDb() {
  let users = readJson(USERS_FILE, []);
  let surveys = readJson(SURVEYS_FILE, []);
  let responses = readJson(RESPONSES_FILE, []);

  // Seed default admin user
  if (users.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('123456', salt);
    const defaultUser = {
      id: 'user_admin_01',
      username: 'admin',
      passwordHash,
      nickname: '蛋仔岛主',
      role: 'admin',
      avatarColor: '#FFD23F', // signature yellow
      hat: 'crown',
      createdAt: new Date().toISOString()
    };
    users.push(defaultUser);
    writeJson(USERS_FILE, users);
    console.log('[DB] Seeded default user: admin / 123456');
  }

  // Seed default Egg Party survey
  if (surveys.length === 0) {
    const defaultSurveyId = 'survey_demo_01';
    const defaultSurvey = {
      id: defaultSurveyId,
      shareCode: 'EGG888',
      userId: 'user_admin_01',
      title: '蛋仔派对：新赛季狂欢大调研 🐣✨',
      description: '操控你的专属萌趣蛋仔，奔跑跳跃闯过一道道关卡，留下你最珍贵的派对建议与声音吧！',
      theme: 'candy', // candy, cyber, sky, sunset
      published: true,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date().toISOString(),
      questions: [
        {
          id: 'q1',
          type: 'single',
          title: '在蛋仔岛闲逛时，你最喜欢打卡哪个游乐设施？🎡',
          obstacleType: 'trampoline', // 弹簧蹦床
          options: [
            '摩天轮高空看日落 🌇',
            '巨型蹦床飞天挑战 🤸',
            '和小伙伴叠高高拍照 🐣',
            '投石机把别人弹飞 🚀'
          ]
        },
        {
          id: 'q2',
          type: 'multiple',
          title: '在决胜关巅峰赛中，你最喜欢拾取哪些决战技道具？（多选）⚡',
          obstacleType: 'spinner', // 旋转大风车
          options: [
            '巨大化变身霸气碾压 🦖',
            '无敌金钟罩护体 🛡️',
            '弹簧钩锁极速追击 🪢',
            '快乐雪球大冰冻 ❄️',
            '隐身魔药暗中偷袭 👻'
          ]
        },
        {
          id: 'q3',
          type: 'open_ended',
          title: '你最希望下一季蛋仔乐园推出什么趣味新地图？（可以打字，更欢迎按住语音麦克风直接说哦！）🎤',
          obstacleType: 'mic_stage', // 灵感留声舞台
          allowVoice: true,
          allowText: true
        },
        {
          id: 'q4',
          type: 'single',
          title: '如果推出蛋仔专属联名外观，你最期待哪种风格？🎨',
          obstacleType: 'rainbow', // 彩虹终点桥
          options: [
            '国风神话机甲风 🐉',
            '甜点烘焙软萌风 🍰',
            '深海发光水母风 🪼',
            '复古像素电玩风 👾'
          ]
        }
      ]
    };
    surveys.push(defaultSurvey);
    writeJson(SURVEYS_FILE, surveys);
    console.log('[DB] Seeded default survey: EGG888');

    // Seed mock responses so analytics have rich initial data
    if (responses.length === 0) {
      const mockResponses = [
        {
          id: 'resp_01',
          surveyId: defaultSurveyId,
          playerNickname: '飞天皮蛋',
          eggCustom: { color: '#FFD23F', hat: 'propeller' },
          timeSpentSeconds: 42,
          completedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          answers: {
            q1: { type: 'single', value: 0 },
            q2: { type: 'multiple', value: [0, 2] },
            q3: { 
              type: 'open_ended', 
              mode: 'text', 
              text: '希望出个重力反转地图！蛋仔可以走到天花板上，超级刺激好玩！',
              audioUrl: null 
            },
            q4: { type: 'single', value: 1 }
          }
        },
        {
          id: 'resp_02',
          surveyId: defaultSurveyId,
          playerNickname: '跳跳粉蛋',
          eggCustom: { color: '#FF6584', hat: 'bunny' },
          timeSpentSeconds: 36,
          completedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
          answers: {
            q1: { type: 'single', value: 1 },
            q2: { type: 'multiple', value: [1, 2, 3] },
            q3: { 
              type: 'open_ended', 
              mode: 'voice', 
              text: '【语音转文字】我想要一个游乐园过山车地图，大家可以抢座位比赛！',
              audioUrl: '/audio/demo_voice_1.wav' 
            },
            q4: { type: 'single', value: 0 }
          }
        },
        {
          id: 'resp_03',
          surveyId: defaultSurveyId,
          playerNickname: '机智绿蛋',
          eggCustom: { color: '#00E676', hat: 'crown' },
          timeSpentSeconds: 51,
          completedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
          answers: {
            q1: { type: 'single', value: 2 },
            q2: { type: 'multiple', value: [0, 1] },
            q3: { 
              type: 'open_ended', 
              mode: 'text', 
              text: '希望能多来点水上漂流赛道和滑梯！',
              audioUrl: null 
            },
            q4: { type: 'single', value: 2 }
          }
        },
        {
          id: 'resp_04',
          surveyId: defaultSurveyId,
          playerNickname: '暴走黑蛋',
          eggCustom: { color: '#333333', hat: 'glasses' },
          timeSpentSeconds: 29,
          completedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
          answers: {
            q1: { type: 'single', value: 1 },
            q2: { type: 'multiple', value: [2, 4] },
            q3: { 
              type: 'open_ended', 
              mode: 'text', 
              text: '必须支持更多双人合作关卡，和对象一起闯关！',
              audioUrl: null 
            },
            q4: { type: 'single', value: 3 }
          }
        }
      ];
      responses.push(...mockResponses);
      writeJson(RESPONSES_FILE, responses);
      console.log('[DB] Seeded mock responses');
    }
  }
}

// User CRUD
const Users = {
  findAll: () => readJson(USERS_FILE, []),
  findById: (id) => readJson(USERS_FILE, []).find(u => u.id === id),
  findByUsername: (username) => readJson(USERS_FILE, []).find(u => u.username.toLowerCase() === username.toLowerCase()),
  create: (userData) => {
    const users = readJson(USERS_FILE, []);
    const newUser = {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      role: userData.role || 'user',
      createdAt: new Date().toISOString(),
      ...userData
    };
    users.push(newUser);
    writeJson(USERS_FILE, users);
    return newUser;
  },
  update: (id, updates) => {
    const users = readJson(USERS_FILE, []);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = {
      ...users[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeJson(USERS_FILE, users);
    return users[idx];
  },
  delete: (id) => {
    let users = readJson(USERS_FILE, []);
    const initialLen = users.length;
    users = users.filter(u => u.id !== id);
    if (users.length !== initialLen) {
      writeJson(USERS_FILE, users);
      // Clean up surveys and responses owned by this user
      let surveys = readJson(SURVEYS_FILE, []);
      const userSurveyIds = surveys.filter(s => s.userId === id).map(s => s.id);
      surveys = surveys.filter(s => s.userId !== id);
      writeJson(SURVEYS_FILE, surveys);

      let responses = readJson(RESPONSES_FILE, []);
      responses = responses.filter(r => !userSurveyIds.includes(r.surveyId));
      writeJson(RESPONSES_FILE, responses);
      return true;
    }
    return false;
  }
};

// Survey CRUD
const Surveys = {
  findAll: () => readJson(SURVEYS_FILE, []),
  findByUserId: (userId) => readJson(SURVEYS_FILE, []).filter(s => s.userId === userId),
  findById: (id) => readJson(SURVEYS_FILE, []).find(s => s.id === id),
  findByShareCode: (code) => readJson(SURVEYS_FILE, []).find(s => s.shareCode.toUpperCase() === code.toUpperCase()),
  create: (surveyData) => {
    const surveys = readJson(SURVEYS_FILE, []);
    const newSurvey = {
      id: 'survey_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shareCode: generateCode(),
      published: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...surveyData
    };
    surveys.push(newSurvey);
    writeJson(SURVEYS_FILE, surveys);
    return newSurvey;
  },
  update: (id, updates) => {
    const surveys = readJson(SURVEYS_FILE, []);
    const idx = surveys.findIndex(s => s.id === id);
    if (idx === -1) return null;
    surveys[idx] = {
      ...surveys[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeJson(SURVEYS_FILE, surveys);
    return surveys[idx];
  },
  delete: (id) => {
    let surveys = readJson(SURVEYS_FILE, []);
    const initialLen = surveys.length;
    surveys = surveys.filter(s => s.id !== id);
    if (surveys.length !== initialLen) {
      writeJson(SURVEYS_FILE, surveys);
      // Clean up related responses
      let responses = readJson(RESPONSES_FILE, []);
      responses = responses.filter(r => r.surveyId !== id);
      writeJson(RESPONSES_FILE, responses);
      return true;
    }
    return false;
  }
};

// Response CRUD
const Responses = {
  findBySurveyId: (surveyId) => readJson(RESPONSES_FILE, []).filter(r => r.surveyId === surveyId),
  create: (responseData) => {
    const responses = readJson(RESPONSES_FILE, []);
    const newResponse = {
      id: 'resp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      completedAt: new Date().toISOString(),
      ...responseData
    };
    responses.push(newResponse);
    writeJson(RESPONSES_FILE, responses);
    return newResponse;
  },
  delete: (id) => {
    let responses = readJson(RESPONSES_FILE, []);
    const initialLen = responses.length;
    responses = responses.filter(r => r.id !== id);
    if (responses.length !== initialLen) {
      writeJson(RESPONSES_FILE, responses);
      return true;
    }
    return false;
  }
};

// Initialize
initDb();

module.exports = {
  Users,
  Surveys,
  Responses,
  UPLOADS_DIR
};
