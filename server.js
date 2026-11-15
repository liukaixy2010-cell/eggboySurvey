const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { Users, Surveys, Responses, UPLOADS_DIR } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eggboy_super_secret_key_2026';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static vendor files mapping
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));
app.use('/vendor/canvas-confetti', express.static(path.join(__dirname, 'node_modules', 'canvas-confetti', 'dist')));

// Audio uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Public frontend
app.use(express.static(path.join(__dirname, 'public')));

// Auth Helper
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: '登录状态已失效，请重新登录' });
    }
    const user = Users.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    user.role = user.role || (user.username === 'admin' ? 'admin' : 'user');
    req.user = user;
    next();
  });
}

// ================= AUTH ROUTES =================
// 1. Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, nickname, avatarColor, hat } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: '用户名至少3位，密码至少4位' });
    }
    if (Users.findByUsername(username)) {
      return res.status(400).json({ error: '该用户名已被注册，请尝试其他名称' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = Users.create({
      username,
      passwordHash,
      nickname: nickname || ('蛋仔玩家_' + Math.floor(Math.random() * 8999 + 1000)),
      avatarColor: avatarColor || '#FFD23F',
      hat: hat || 'propeller'
    });

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        nickname: newUser.nickname,
        role: newUser.role || 'user',
        avatarColor: newUser.avatarColor,
        hat: newUser.hat
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败，服务器错误' });
  }
});

// 2. Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    const user = Users.findByUsername(username);
    if (!user) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    const role = user.role || (user.username === 'admin' ? 'admin' : 'user');
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: role,
        avatarColor: user.avatarColor,
        hat: user.hat
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败，服务器错误' });
  }
});

// 3. Current User
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      nickname: req.user.nickname,
      role: req.user.role || (req.user.username === 'admin' ? 'admin' : 'user'),
      avatarColor: req.user.avatarColor,
      hat: req.user.hat
    }
  });
});

// ================= SURVEY ROUTES (CREATOR) =================
// List user's surveys
app.get('/api/surveys', authenticateToken, (req, res) => {
  try {
    const surveys = Surveys.findByUserId(req.user.id);
    const surveysWithStats = surveys.map(s => {
      const respCount = Responses.findBySurveyId(s.id).length;
      return {
        ...s,
        responseCount: respCount
      };
    });
    res.json(surveysWithStats);
  } catch (err) {
    res.status(500).json({ error: '获取问卷列表失败' });
  }
});

// Create survey
app.post('/api/surveys', authenticateToken, (req, res) => {
  try {
    const { title, description, questions, theme } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '问卷标题不能为空' });
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: '至少需要添加一个关卡题目' });
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.title || !q.title.trim()) {
        return res.status(400).json({ error: `第 ${i + 1} 关的题目标题不能为空` });
      }
      if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length < 2)) {
        return res.status(400).json({ error: `第 ${i + 1} 关的选择题至少需要 2 个选项` });
      }
    }

    const newSurvey = Surveys.create({
      userId: req.user.id,
      title: title.trim(),
      description: (description || '').trim(),
      questions,
      theme: theme || 'candy'
    });

    res.json(newSurvey);
  } catch (err) {
    console.error('Create survey error:', err);
    res.status(500).json({ error: '创建问卷失败' });
  }
});

// Get single survey details
app.get('/api/surveys/:id', authenticateToken, (req, res) => {
  const survey = Surveys.findById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: '问卷未找到' });
  }
  if (survey.userId !== req.user.id) {
    return res.status(403).json({ error: '无权访问此问卷' });
  }
  const responseCount = Responses.findBySurveyId(survey.id).length;
  res.json({ ...survey, responseCount });
});

// Update survey
app.put('/api/surveys/:id', authenticateToken, (req, res) => {
  try {
    const survey = Surveys.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷未找到' });
    }
    if (survey.userId !== req.user.id) {
      return res.status(403).json({ error: '无权修改此问卷' });
    }

    const { title, description, questions, theme, published } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (questions !== undefined) updates.questions = questions;
    if (theme !== undefined) updates.theme = theme;
    if (published !== undefined) updates.published = !!published;

    const updated = Surveys.update(req.params.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新问卷失败' });
  }
});

// Delete survey
app.delete('/api/surveys/:id', authenticateToken, (req, res) => {
  const survey = Surveys.findById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: '问卷未找到' });
  }
  if (survey.userId !== req.user.id) {
    return res.status(403).json({ error: '无权删除此问卷' });
  }

  Surveys.delete(req.params.id);
  res.json({ success: true, message: '问卷已删除' });
});

// Publish / Unpublish survey
app.post('/api/surveys/:id/publish', authenticateToken, (req, res) => {
  const survey = Surveys.findById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: '问卷未找到' });
  }
  if (survey.userId !== req.user.id) {
    return res.status(403).json({ error: '无权操作此问卷' });
  }

  const newStatus = !survey.published;
  const updated = Surveys.update(survey.id, { published: newStatus });
  res.json({
    success: true,
    published: updated.published,
    shareCode: updated.shareCode,
    message: updated.published ? '问卷已成功发布！闯关赛道已开启！' : '问卷已下线暂停开放'
  });
});

// ================= RESULTS & ANALYTICS =================
app.get('/api/surveys/:id/results', authenticateToken, (req, res) => {
  try {
    const survey = Surveys.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷未找到' });
    }
    if (survey.userId !== req.user.id) {
      return res.status(403).json({ error: '无权查看此问卷结果' });
    }

    const responses = Responses.findBySurveyId(survey.id);
    const totalSubmissions = responses.length;

    // Calculate average time spent
    let totalTime = 0;
    responses.forEach(r => {
      totalTime += (r.timeSpentSeconds || 0);
    });
    const avgTimeSpent = totalSubmissions > 0 ? Math.round(totalTime / totalSubmissions) : 0;

    // Analyze each question
    const questionStats = survey.questions.map((q) => {
      if (q.type === 'single' || q.type === 'multiple') {
        const optionCounts = (q.options || []).map(() => 0);
        let answeredCount = 0;

        responses.forEach(r => {
          const ans = r.answers && r.answers[q.id];
          if (ans !== undefined && ans !== null) {
            if (q.type === 'single' && typeof ans.value === 'number') {
              if (optionCounts[ans.value] !== undefined) {
                optionCounts[ans.value]++;
                answeredCount++;
              }
            } else if (q.type === 'multiple' && Array.isArray(ans.value)) {
              let hasAny = false;
              ans.value.forEach(optIdx => {
                if (optionCounts[optIdx] !== undefined) {
                  optionCounts[optIdx]++;
                  hasAny = true;
                }
              });
              if (hasAny) answeredCount++;
            }
          }
        });

        const optionsWithStats = (q.options || []).map((optText, idx) => {
          const count = optionCounts[idx] || 0;
          const percentage = answeredCount > 0 ? ((count / answeredCount) * 100).toFixed(1) : '0.0';
          return {
            text: optText,
            count,
            percentage
          };
        });

        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          answeredCount,
          options: optionsWithStats
        };
      } else if (q.type === 'open_ended') {
        const items = [];
        responses.forEach(r => {
          const ans = r.answers && r.answers[q.id];
          if (ans && (ans.text || ans.audioUrl)) {
            items.push({
              responseId: r.id,
              playerNickname: r.playerNickname || '神秘蛋仔',
              eggCustom: r.eggCustom,
              mode: ans.mode || (ans.audioUrl ? 'voice' : 'text'),
              text: ans.text || '',
              audioUrl: ans.audioUrl || null,
              completedAt: r.completedAt
            });
          }
        });

        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          answeredCount: items.length,
          responses: items
        };
      }
    });

    res.json({
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        shareCode: survey.shareCode,
        published: survey.published,
        theme: survey.theme,
        createdAt: survey.createdAt
      },
      totalSubmissions,
      avgTimeSpent,
      questionStats,
      rawResponses: responses.map(r => ({
        id: r.id,
        playerNickname: r.playerNickname,
        eggCustom: r.eggCustom,
        timeSpentSeconds: r.timeSpentSeconds,
        completedAt: r.completedAt
      }))
    });
  } catch (err) {
    console.error('Results error:', err);
    res.status(500).json({ error: '获取统计结果失败' });
  }
});

// Delete a specific response
app.delete('/api/surveys/:id/responses/:responseId', authenticateToken, (req, res) => {
  const survey = Surveys.findById(req.params.id);
  if (!survey || survey.userId !== req.user.id) {
    return res.status(403).json({ error: '无权操作' });
  }
  Responses.delete(req.params.responseId);
  res.json({ success: true, message: '记录已删除' });
});

// ================= PUBLIC PLAY & SUBMIT =================
// 0. Get recent published surveys (up to 10) for guest homepage
app.get('/api/public/recent-surveys', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const allSurveys = Surveys.findAll();
    const allUsers = Users.findAll();

    // Filter published, sort by createdAt descending, take top `limit`
    const publishedSurveys = allSurveys
      .filter(s => s.published)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    const result = publishedSurveys.map(s => {
      const author = allUsers.find(u => u.id === s.userId);
      const respCount = Responses.findBySurveyId(s.id).length;
      return {
        id: s.id,
        shareCode: s.shareCode,
        title: s.title,
        description: s.description,
        theme: s.theme,
        questionsCount: (s.questions || []).length,
        createdAt: s.createdAt,
        author: {
          nickname: author ? author.nickname : '蛋仔岛民',
          avatarColor: author ? author.avatarColor : '#FFD23F'
        },
        responseCount: respCount
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取最新问卷失败' });
  }
});

// 1. Get survey by share code or id for public gameplay
app.get('/api/play/:code', (req, res) => {
  const code = req.params.code;
  const survey = Surveys.findByShareCode(code) || Surveys.findById(code);
  if (!survey) {
    return res.status(404).json({ error: '未找到该闯关问卷，可能已被作者移除' });
  }
  if (!survey.published) {
    return res.status(403).json({ error: '该问卷尚未发布或已下线' });
  }

  // Return survey config for players (strip author userId)
  res.json({
    id: survey.id,
    shareCode: survey.shareCode,
    title: survey.title,
    description: survey.description,
    theme: survey.theme,
    questions: survey.questions
  });
});

// 2. Submit gameplay answers
app.post('/api/play/:code/submit', (req, res) => {
  try {
    const code = req.params.code;
    const survey = Surveys.findByShareCode(code) || Surveys.findById(code);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (!survey.published) {
      return res.status(403).json({ error: '问卷已下线' });
    }

    const { playerNickname, eggCustom, answers, timeSpentSeconds, device } = req.body;

    const newResponse = Responses.create({
      surveyId: survey.id,
      playerNickname: (playerNickname || '闯关蛋仔').trim(),
      eggCustom: eggCustom || { color: '#FFD23F', hat: 'propeller' },
      answers: answers || {},
      timeSpentSeconds: timeSpentSeconds || 0,
      device: device || 'web'
    });

    res.json({
      success: true,
      message: '闯关大成功！问卷已顺利提交！🎉',
      responseId: newResponse.id
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: '提交失败，请稍后重试' });
  }
});

// 3. Generate QR code for sharing
app.get('/api/play/:code/qrcode', async (req, res) => {
  try {
    const code = req.params.code;
    const host = req.get('host');
    const protocol = req.protocol;
    const playUrl = `${protocol}://${host}/#/play/${code}`;

    const qrDataUrl = await QRCode.toDataURL(playUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#2D3748',
        light: '#FFFFFF'
      }
    });

    res.json({ url: playUrl, qrcode: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: '生成二维码失败' });
  }
});

// ================= AUDIO UPLOAD (VOICE RECORDING) =================
app.post('/api/upload-audio', (req, res) => {
  try {
    const { audioData, ext = 'webm' } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: '未提供音频数据' });
    }

    // Extract base64
    const matches = audioData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    let buffer;
    if (matches && matches.length === 3) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(audioData, 'base64');
    }

    const filename = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    const audioUrl = `/uploads/audio/${filename}`;
    res.json({
      success: true,
      audioUrl
    });
  } catch (err) {
    console.error('Upload audio error:', err);
    res.status(500).json({ error: '上传录音失败' });
  }
});

// ================= ADMIN MANAGEMENT ROUTES =================
function requireAdmin(req, res, next) {
  const role = req.user && (req.user.role || (req.user.username === 'admin' ? 'admin' : 'user'));
  if (role !== 'admin') {
    return res.status(403).json({ error: '权限不足：仅管理员可以访问此接口' });
  }
  next();
}

// 1. Overview Statistics
app.get('/api/admin/overview', authenticateToken, requireAdmin, (req, res) => {
  try {
    const allUsers = Users.findAll();
    const allSurveys = Surveys.findAll();
    let totalResponses = 0;
    allSurveys.forEach(s => {
      totalResponses += Responses.findBySurveyId(s.id).length;
    });

    const publishedSurveys = allSurveys.filter(s => s.published).length;

    res.json({
      totalUsers: allUsers.length,
      totalSurveys: allSurveys.length,
      publishedSurveys,
      totalResponses
    });
  } catch (err) {
    res.status(500).json({ error: '获取后台概览数据失败' });
  }
});

// 2. Manage Users: List all registered users
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const allUsers = Users.findAll();
    const allSurveys = Surveys.findAll();

    const usersData = allUsers.map(u => {
      const userSurveys = allSurveys.filter(s => s.userId === u.id);
      let responsesCount = 0;
      userSurveys.forEach(s => {
        responsesCount += Responses.findBySurveyId(s.id).length;
      });

      return {
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        role: u.role || (u.username === 'admin' ? 'admin' : 'user'),
        avatarColor: u.avatarColor || '#FFD23F',
        hat: u.hat || 'propeller',
        createdAt: u.createdAt,
        surveysCount: userSurveys.length,
        responsesCount
      };
    });

    res.json(usersData);
  } catch (err) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 3. Manage Users: Create new user
app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, nickname, role, avatarColor, hat } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (Users.findByUsername(username)) {
      return res.status(400).json({ error: '该用户名已存在' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = Users.create({
      username,
      passwordHash,
      nickname: nickname || username,
      role: role || 'user',
      avatarColor: avatarColor || '#FFD23F',
      hat: hat || 'propeller'
    });

    res.json({
      success: true,
      message: '用户创建成功',
      user: {
        id: newUser.id,
        username: newUser.username,
        nickname: newUser.nickname,
        role: newUser.role,
        createdAt: newUser.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 4. Manage Users: Update user (nickname, password reset, role)
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const user = Users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const { nickname, role, password, avatarColor, hat } = req.body;
    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname.trim();
    if (role !== undefined) updates.role = role;
    if (avatarColor !== undefined) updates.avatarColor = avatarColor;
    if (hat !== undefined) updates.hat = hat;

    if (password && password.trim().length >= 4) {
      const salt = bcrypt.genSaltSync(10);
      updates.passwordHash = bcrypt.hashSync(password.trim(), salt);
    }

    const updated = Users.update(req.params.id, updates);
    res.json({
      success: true,
      message: '用户信息已更新',
      user: {
        id: updated.id,
        username: updated.username,
        nickname: updated.nickname,
        role: updated.role,
        avatarColor: updated.avatarColor,
        hat: updated.hat
      }
    });
  } catch (err) {
    res.status(500).json({ error: '更新用户失败' });
  }
});

// 5. Manage Users: Delete user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const targetUser = Users.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (targetUser.id === req.user.id || targetUser.username.toLowerCase() === 'admin') {
      return res.status(400).json({ error: '不能删除默认管理员自身账号' });
    }

    Users.delete(req.params.id);
    res.json({ success: true, message: '用户及其问卷已成功删除' });
  } catch (err) {
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 6. Manage All Questionnaires: List all surveys across all users
app.get('/api/admin/surveys', authenticateToken, requireAdmin, (req, res) => {
  try {
    const allSurveys = Surveys.findAll();
    const allUsers = Users.findAll();

    const surveysWithDetails = allSurveys.map(s => {
      const author = allUsers.find(u => u.id === s.userId);
      const respCount = Responses.findBySurveyId(s.id).length;
      return {
        id: s.id,
        shareCode: s.shareCode,
        title: s.title,
        description: s.description,
        theme: s.theme,
        published: s.published,
        questionsCount: (s.questions || []).length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        author: {
          id: author ? author.id : s.userId,
          username: author ? author.username : '未知用户',
          nickname: author ? author.nickname : '蛋仔作者'
        },
        responseCount: respCount
      };
    });

    res.json(surveysWithDetails);
  } catch (err) {
    res.status(500).json({ error: '获取所有问卷列表失败' });
  }
});

// 7. Manage All Questionnaires: Delete any survey
app.delete('/api/admin/surveys/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const s = Surveys.findById(req.params.id);
    if (!s) {
      return res.status(404).json({ error: '问卷未找到' });
    }
    Surveys.delete(req.params.id);
    res.json({ success: true, message: '问卷已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除问卷失败' });
  }
});

// 8. Manage All Questionnaires: Toggle publish status
app.post('/api/admin/surveys/:id/publish', authenticateToken, requireAdmin, (req, res) => {
  try {
    const s = Surveys.findById(req.params.id);
    if (!s) {
      return res.status(404).json({ error: '问卷未找到' });
    }
    const newStatus = !s.published;
    const updated = Surveys.update(s.id, { published: newStatus });
    res.json({
      success: true,
      published: updated.published,
      message: updated.published ? '问卷已发布开放' : '问卷已下线'
    });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// Catch-all route to serve SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🐣 《蛋仔问卷》蛋仔闯关问卷系统已启动！`);
  console.log(`🌐 本地访问地址: http://localhost:${PORT}`);
  console.log(`🎮 默认管理员账号: admin / 密码: 123456`);
  console.log(`🎉 体验闯关演示码: EGG888`);
  console.log(`===============================================`);
});
