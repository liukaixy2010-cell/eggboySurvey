/**
 * Main Application Controller for "蛋仔问卷" (Eggboy Survey)
 * SPA Router, Views & UI Interactions
 */

// Import 3D Game Engine
let EggPartyGameClass = null;
import('/js/game3d.js').then(module => {
  EggPartyGameClass = module.EggPartyGame;
}).catch(err => {
  console.error('Failed to load 3D game engine module:', err);
});

class App {
  constructor() {
    this.currentUser = null;
    this.currentView = 'home';
    this.activeGame = null;
    this.charts = [];
    this.init();
  }

  t(key, vars) {
    return window.i18n ? window.i18n.t(key, vars) : key;
  }

  async init() {
    // Check saved user session
    this.currentUser = window.api.getUser();
    if (this.currentUser) {
      try {
        const res = await window.api.getMe();
        this.currentUser = res.user;
        window.api.setUser(this.currentUser);
      } catch (e) {
        // Token expired or invalid
        window.api.clearAuth();
        this.currentUser = null;
      }
    }

    this.renderHeader();
    this.setupHashRouter();

    // Listen for language change to dynamically re-render
    if (window.i18n) {
      window.i18n.onChange(() => {
        this.renderHeader();
        const hash = window.location.hash || '#/';
        if (!hash.startsWith('#/play/')) {
          this.handleRoute();
        }
      });
    }
  }

  // --- Router ---
  setupHashRouter() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  }

  handleRoute() {
    const hash = window.location.hash || '#/';
    if (this.activeGame) {
      this.activeGame.destroy();
      this.activeGame = null;
    }

    if (hash.startsWith('#/play/')) {
      document.body.classList.add('in-game-mode');
      const code = hash.replace('#/play/', '').trim();
      this.renderPlayView(code);
    } else {
      document.body.classList.remove('in-game-mode');
      if (hash.startsWith('#/admin')) {
        this.renderAdminView();
      } else if (hash.startsWith('#/editor/')) {
        const id = hash.replace('#/editor/', '').trim();
        this.renderEditorView(id);
      } else if (hash === '#/editor') {
        this.renderEditorView(null);
      } else if (hash.startsWith('#/results/')) {
        const id = hash.replace('#/results/', '').trim();
        this.renderResultsView(id);
      } else {
        this.renderHomeView();
      }
    }
  }

  navigateTo(hash) {
    window.location.hash = hash;
  }

  // --- UI Toast & Helpers ---
  showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast-msg';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // --- Header Navigation ---
  renderHeader() {
    const headerContainer = document.getElementById('header-app');
    if (!headerContainer) return;

    const user = this.currentUser;
    const curLang = window.i18n ? window.i18n.getLanguage() : 'zh-CN';
    const isPlaying = window.soundEngine && window.soundEngine.isBGMPlaying;

    headerContainer.innerHTML = `
      <div class="header-bar">
        <a class="brand-logo" href="#/">
          <div class="brand-egg-icon">🐣</div>
          <div>
            <span class="brand-title">${this.t('app.brandName')}</span>
            <span class="brand-badge">${this.t('app.brandBadge')}</span>
          </div>
        </a>
        <div class="nav-actions">
          <!-- Language Selector -->
          <select id="lang-select" class="egg-select-sm" title="🌐 Language / 语言">
            <option value="zh-CN" ${curLang === 'zh-CN' ? 'selected' : ''}>🇨🇳 简体中文</option>
            <option value="zh-TW" ${curLang === 'zh-TW' ? 'selected' : ''}>🇭🇰 繁體中文</option>
            <option value="ja" ${curLang === 'ja' ? 'selected' : ''}>🇯🇵 日本語</option>
            <option value="en" ${curLang === 'en' ? 'selected' : ''}>🇺🇸 English</option>
          </select>

          <button class="egg-btn egg-btn-sm" id="btn-toggle-bgm" title="音乐开关">
            ${isPlaying ? this.t('app.bgmOn') : this.t('app.bgmOff')}
          </button>
          ${user ? `
            <div style="display:flex; align-items:center; gap:8px;">
              ${(user.role === 'admin' || user.username === 'admin') ? `
                <a class="egg-btn egg-btn-sm egg-btn-mint" href="#/admin" style="font-weight:900;">
                  ${this.t('app.adminNav')}
                </a>
              ` : ''}
              <span style="font-weight:800; font-size:14px; color:#2D3748;">
                🐣 ${user.nickname || user.username}
              </span>
              <button class="egg-btn egg-btn-sm egg-btn-pink" id="btn-logout">${this.t('app.logout')}</button>
            </div>
          ` : `
            <button class="egg-btn egg-btn-sm egg-btn-primary" id="btn-open-auth">
              ${this.t('app.loginOrRegister')}
            </button>
          `}
        </div>
      </div>
    `;

    // Bind Language switch
    document.getElementById('lang-select')?.addEventListener('change', (e) => {
      if (window.i18n) {
        window.i18n.setLanguage(e.target.value);
      }
    });

    // Bind BGM toggle
    document.getElementById('btn-toggle-bgm')?.addEventListener('click', (e) => {
      const playing = window.soundEngine.toggleBGM();
      e.target.textContent = playing ? this.t('app.bgmOn') : this.t('app.bgmOff');
    });

    // Bind Login / Logout
    document.getElementById('btn-open-auth')?.addEventListener('click', () => {
      this.openAuthModal();
    });
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      window.api.clearAuth();
      this.currentUser = null;
      this.renderHeader();
      this.showToast(this.t('app.logoutSuccess'));
      this.renderHomeView();
    });
  }

  // ================= VIEW: HOME (首页与问卷列表) =================
  async renderHomeView() {
    this.currentView = 'home';
    const mainContainer = document.getElementById('app-root');

    mainContainer.innerHTML = `
      <div class="main-wrapper">
        <!-- Hero Banner -->
        <div class="hero-banner">
          <div class="hero-content">
            <h1 class="hero-title">${this.t('home.heroTitle')}</h1>
            <p class="hero-desc">
              ${this.t('home.heroDesc')}
            </p>
            <div class="hero-actions">
              <button class="egg-btn egg-btn-primary" id="hero-create-btn">
                ${this.t('home.btnCreate')}
              </button>
              <a class="egg-btn egg-btn-pink" href="#/play/EGG888">
                ${this.t('home.btnPlayDemo')}
              </a>
            </div>
          </div>
          <div class="hero-egg-avatar">🐣</div>
        </div>

        <!-- Surveys Section -->
        <div class="section-header">
          <h2 class="section-title">
            <span>${this.currentUser ? this.t('home.mySurveysTitle') : this.t('home.recentSurveysTitle')}</span>
          </h2>
          <div style="display:flex; gap:10px;">
            ${this.currentUser ? `
              <button class="egg-btn egg-btn-sm egg-btn-primary" id="list-create-btn">
                ${this.t('home.btnNewSurvey')}
              </button>
            ` : `
              <button class="egg-btn egg-btn-sm egg-btn-primary" id="list-login-btn">
                ${this.t('home.btnLoginToManage')}
              </button>
            `}
          </div>
        </div>

        <div id="survey-list-container">
          <div style="text-align:center; padding:40px; font-weight:700; color:#718096;">
            ${this.t('home.loading')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('hero-create-btn')?.addEventListener('click', () => {
      if (!this.currentUser) {
        this.openAuthModal(() => this.navigateTo('#/editor'));
      } else {
        this.navigateTo('#/editor');
      }
    });

    document.getElementById('list-create-btn')?.addEventListener('click', () => {
      this.navigateTo('#/editor');
    });

    document.getElementById('list-login-btn')?.addEventListener('click', () => {
      this.openAuthModal(() => {
        this.renderHeader();
        this.renderHomeView();
      });
    });

    // Load surveys
    this.loadSurveysList();
  }

  async loadSurveysList() {
    const listContainer = document.getElementById('survey-list-container');
    if (!listContainer) return;

    if (!this.currentUser) {
      try {
        const recentSurveys = await window.api.getRecentSurveys(10);

        let guestHtml = `
          <!-- Guest Invitation Notice -->
          <div class="egg-card guest-welcome-banner" style="margin-bottom:24px; background:linear-gradient(135deg, #FFF9DB 0%, #FFE3E8 100%); border:3px solid #2D3748; box-shadow:0 6px 0 #2D3748;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
              <div style="display:flex; align-items:center; gap:16px;">
                <div style="font-size:42px; line-height:1;">🐣</div>
                <div>
                  <h3 style="font-size:18px; font-weight:900; color:#2D3748; margin-bottom:4px;">
                    ${this.t('home.guestBannerTitle')}
                  </h3>
                  <p style="font-size:13px; color:#4A5568; margin:0;">
                    ${this.t('home.guestBannerDesc')}
                  </p>
                </div>
              </div>
              <div style="display:flex; gap:10px;">
                <button class="egg-btn egg-btn-sm egg-btn-primary" id="btn-guest-login-banner">
                  ${this.t('home.btnGuestLogin')}
                </button>
                <a class="egg-btn egg-btn-sm egg-btn-pink" href="#/play/EGG888">
                  ${this.t('home.btnGuestTryDemo')}
                </a>
              </div>
            </div>
          </div>
        `;

        if (!recentSurveys || recentSurveys.length === 0) {
          guestHtml += `
            <div class="egg-card" style="text-align:center; padding:40px 20px;">
              <div style="font-size:48px; margin-bottom:12px;">🎈</div>
              <h3 style="font-size:18px; font-weight:800; margin-bottom:8px;">${this.t('home.emptyGuestSurveys')}</h3>
              <button class="egg-btn egg-btn-primary" id="btn-guest-first-create" style="margin-top:14px;">
                ${this.t('home.btnLoginToCreate')}
              </button>
            </div>
          `;
          listContainer.innerHTML = guestHtml;
          document.getElementById('btn-guest-login-banner')?.addEventListener('click', () => {
            this.openAuthModal(() => {
              this.renderHeader();
              this.renderHomeView();
            });
          });
          document.getElementById('btn-guest-first-create')?.addEventListener('click', () => {
            this.openAuthModal(() => {
              this.renderHeader();
              this.navigateTo('#/editor');
            });
          });
          return;
        }

        guestHtml += '<div class="survey-grid">';
        recentSurveys.forEach((s, idx) => {
          const authorNick = s.author?.nickname || '蛋仔岛民';
          const authorColor = s.author?.avatarColor || '#FFD23F';
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';

          guestHtml += `
            <div class="survey-item-card">
              <div>
                <div class="survey-item-header">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="survey-status-tag status-published">
                      ${this.t('home.statusPublished')}
                    </span>
                    <span style="font-size:12px; font-weight:800; color:#A0AEC0;">
                      ${this.t('home.topRank', { n: idx + 1 })}
                    </span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#718096;">
                    <div style="width:20px; height:20px; border-radius:50%; background:${authorColor}; border:1.5px solid #2D3748; display:flex; align-items:center; justify-content:center; font-size:11px;">🐣</div>
                    <span>${this.escapeHtml(authorNick)}</span>
                  </div>
                </div>

                <a href="#/play/${s.shareCode}" style="text-decoration:none; color:inherit; display:block;">
                  <h3 class="survey-card-title survey-link-title" style="cursor:pointer;" title="点击立即进入闯关">
                    ${this.escapeHtml(s.title)}
                  </h3>
                </a>

                <p style="font-size:14px; color:#4A5568; margin-bottom:14px; line-height:1.5;">
                  ${this.escapeHtml(s.description || '')}
                </p>

                <div class="survey-card-meta">
                  <span>${this.t('home.levelsCount', { n: s.questionsCount || 0 })}</span>
                  <span>${this.t('home.responsesCount', { n: s.responseCount || 0 })}</span>
                  <span>📅 ${dateStr}</span>
                </div>
              </div>

              <div class="survey-card-actions">
                <a class="egg-btn egg-btn-sm egg-btn-primary" href="#/play/${s.shareCode}" style="flex:1; text-align:center;">
                  ${this.t('home.btnPlay', { code: s.shareCode })}
                </a>
                <button class="egg-btn egg-btn-sm egg-btn-mint btn-recent-share" data-code="${s.shareCode}" title="生成邀请卡与二维码">
                  ${this.t('home.btnShare')}
                </button>
                <button class="egg-btn egg-btn-sm btn-recent-copy-link" data-code="${s.shareCode}" title="复制闯关链接">
                  📋
                </button>
              </div>
            </div>
          `;
        });
        guestHtml += '</div>';

        listContainer.innerHTML = guestHtml;

        // Bind events for guest view
        document.getElementById('btn-guest-login-banner')?.addEventListener('click', () => {
          this.openAuthModal(() => {
            this.renderHeader();
            this.renderHomeView();
          });
        });

        listContainer.querySelectorAll('.btn-recent-share').forEach(btn => {
          btn.addEventListener('click', () => {
            this.openShareModal(btn.dataset.code);
          });
        });

        listContainer.querySelectorAll('.btn-recent-copy-link').forEach(btn => {
          btn.addEventListener('click', () => {
            const playUrl = `${window.location.origin}/#/play/${btn.dataset.code}`;
            navigator.clipboard.writeText(playUrl).then(() => {
              this.showToast(this.t('home.copyLinkSuccess'));
            }).catch(() => {
              this.showToast(`URL: ${playUrl}`);
            });
          });
        });

      } catch (err) {
        listContainer.innerHTML = `
          <div class="egg-card" style="text-align:center; padding:40px 20px; color:red;">
            加载失败: ${err.message}
          </div>
        `;
      }
      return;
    }

    try {
      const surveys = await window.api.getSurveys();
      if (!surveys || surveys.length === 0) {
        listContainer.innerHTML = `
          <div class="egg-card" style="text-align:center; padding:40px 20px;">
            <div style="font-size:48px; margin-bottom:12px;">🎈</div>
            <h3 style="font-size:18px; font-weight:800; margin-bottom:8px;">${this.t('home.emptySurveys')}</h3>
            <button class="egg-btn egg-btn-primary" style="margin-top:14px;" onclick="window.location.hash='#/editor'">
              ${this.t('home.btnCreateNow')}
            </button>
          </div>
        `;
        return;
      }

      let html = '<div class="survey-grid">';
      surveys.forEach(s => {
        html += `
          <div class="survey-item-card">
            <div>
              <div class="survey-item-header">
                <span class="survey-status-tag ${s.published ? 'status-published' : 'status-draft'}">
                  ${s.published ? this.t('home.statusPublished') : this.t('home.statusDraft')}
                </span>
                <span style="font-size:12px; font-weight:800; color:#A0AEC0;">
                  Code: ${s.shareCode}
                </span>
              </div>
              <h3 class="survey-card-title">${this.escapeHtml(s.title)}</h3>
              <p style="font-size:14px; color:#4A5568; margin-bottom:14px; line-height:1.5;">
                ${this.escapeHtml(s.description || '')}
              </p>
              <div class="survey-card-meta">
                <span>${this.t('home.levelsCount', { n: s.questions ? s.questions.length : 0 })}</span>
                <span>${this.t('home.responsesCount', { n: s.responseCount || 0 })}</span>
              </div>
            </div>
            <div class="survey-card-actions">
              <a class="egg-btn egg-btn-sm egg-btn-primary" href="#/play/${s.shareCode}">
                ${this.t('home.btnPlay', { code: s.shareCode })}
              </a>
              <a class="egg-btn egg-btn-sm egg-btn-blue" href="#/results/${s.id}">
                ${this.t('home.btnStats', { n: s.responseCount || 0 })}
              </a>
              <button class="egg-btn egg-btn-sm egg-btn-mint btn-share-survey" data-id="${s.id}" data-code="${s.shareCode}">
                ${this.t('home.btnShare')}
              </button>
              <button class="egg-btn egg-btn-sm btn-publish-toggle" data-id="${s.id}">
                ${s.published ? this.t('home.btnTogglePublish_online') : this.t('home.btnTogglePublish_offline')}
              </button>
              <a class="egg-btn egg-btn-sm" href="#/editor/${s.id}">
                ${this.t('home.btnEdit')}
              </a>
              <button class="egg-btn egg-btn-sm btn-delete-survey" data-id="${s.id}" title="${this.t('home.btnDelete')}" style="color:#E53E3E;">
                ${this.t('home.btnDelete')}
              </button>
            </div>
          </div>
        `;
      });
      html += '</div>';

      listContainer.innerHTML = html;

      // Event Listeners for action buttons
      listContainer.querySelectorAll('.btn-share-survey').forEach(btn => {
        btn.addEventListener('click', () => {
          this.openShareModal(btn.dataset.code);
        });
      });

      listContainer.querySelectorAll('.btn-publish-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const res = await window.api.togglePublishSurvey(btn.dataset.id);
            this.showToast(res.message);
            this.loadSurveysList();
          } catch (err) {
            this.showToast(err.message);
          }
        });
      });

      listContainer.querySelectorAll('.btn-delete-survey').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('确定要删除此问卷吗？所有答题记录也将被清理。')) {
            try {
              await window.api.deleteSurvey(btn.dataset.id);
              this.showToast('问卷已删除');
              this.loadSurveysList();
            } catch (err) {
              this.showToast(err.message);
            }
          }
        });
      });

    } catch (err) {
      listContainer.innerHTML = `<div class="egg-card" style="color:red;">加载失败: ${err.message}</div>`;
    }
  }

  // ================= VIEW: EDITOR (问卷题目与关卡编辑器) =================
  async renderEditorView(surveyId) {
    this.currentView = 'editor';
    const mainContainer = document.getElementById('app-root');

    if (!this.currentUser) {
      this.openAuthModal(() => this.renderEditorView(surveyId));
      return;
    }

    let surveyData = {
      title: '',
      description: '',
      theme: 'candy',
      questions: [
        {
          id: 'q_' + Date.now(),
          type: 'single',
          title: '你最喜欢的蛋仔活动是？',
          obstacleType: 'trampoline',
          options: ['摩天轮看风景 🎡', '蹦床飞天挑战 🤸']
        }
      ]
    };

    if (surveyId) {
      try {
        const loaded = await window.api.getSurvey(surveyId);
        if (loaded) surveyData = loaded;
      } catch (err) {
        this.showToast('加载问卷失败: ' + err.message);
      }
    }

    mainContainer.innerHTML = `
      <div class="main-wrapper">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
          <h2 class="section-title">
            <span>${surveyId ? this.t('editor.pageTitleEdit') : this.t('editor.pageTitleNew')}</span>
          </h2>
          <button class="egg-btn egg-btn-sm" onclick="window.location.hash='#/'">
            ${this.t('editor.btnBack')}
          </button>
        </div>

        <div class="egg-card">
          <!-- Survey Metadata -->
          <div class="editor-form-group">
            <label class="editor-label">${this.t('editor.surveyTitle')}</label>
            <input type="text" id="edit-survey-title" class="editor-input" 
              placeholder="${this.t('editor.surveyTitlePlaceholder')}" value="${this.escapeHtml(surveyData.title || '')}">
          </div>

          <div class="editor-form-group">
            <label class="editor-label">${this.t('editor.surveyDesc')}</label>
            <textarea id="edit-survey-desc" class="editor-textarea" rows="2" 
              placeholder="${this.t('editor.surveyDescPlaceholder')}">${this.escapeHtml(surveyData.description || '')}</textarea>
          </div>

          <div class="editor-form-group">
            <label class="editor-label">${this.t('editor.surveyTheme')}</label>
            <select id="edit-survey-theme" class="editor-select">
              <option value="candy" ${surveyData.theme === 'candy' ? 'selected' : ''}>${this.t('editor.themeCandy')}</option>
              <option value="sky" ${surveyData.theme === 'sky' ? 'selected' : ''}>${this.t('editor.themeSky')}</option>
              <option value="cyber" ${surveyData.theme === 'cyber' ? 'selected' : ''}>${this.t('editor.themeCyber')}</option>
            </select>
          </div>
        </div>

        <!-- Questions Section -->
        <div class="section-header">
          <h3 class="section-title">
            <span>${this.t('editor.questionsTitle')}</span>
          </h3>
        </div>

        <div id="questions-list-container"></div>

        <!-- Bottom Action Bar (包含 添加新关卡题目 与 保存问卷) -->
        <div style="display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:12px; margin-top:24px; padding:20px; background:#FFF; border:3px solid #2D3748; border-radius:22px; box-shadow:0 6px 0 #2D3748;">
          <button type="button" class="egg-btn egg-btn-mint" id="btn-add-question" style="margin-right:auto;">
            ${this.t('editor.btnAddQuestion')}
          </button>
          <button class="egg-btn egg-btn-sm" onclick="window.location.hash='#/'">${this.t('editor.btnBack')}</button>
          <button class="egg-btn egg-btn-primary" id="btn-save-survey">${this.t('editor.btnSaveSurvey')}</button>
        </div>
      </div>
    `;

    // Render Questions
    const renderQuestions = () => {
      const qListEl = document.getElementById('questions-list-container');
      if (!qListEl) return;

      qListEl.innerHTML = '';
      surveyData.questions.forEach((q, idx) => {
        const qBox = document.createElement('div');
        qBox.className = 'question-box';
        qBox.dataset.qindex = idx;

        let optionsHtml = '';
        if (q.type === 'single' || q.type === 'multiple') {
          optionsHtml = `
            <div style="margin-top:14px;">
              <label class="editor-label">${this.t('editor.optionsLabel')}</label>
              <div class="options-container" data-qindex="${idx}">
                ${(q.options || []).map((opt, optIdx) => `
                  <div class="option-row" data-optindex="${optIdx}">
                    <span class="option-badge">${String.fromCharCode(65 + optIdx)}</span>
                    <input type="text" class="editor-input opt-input" value="${this.escapeHtml(opt)}" placeholder="${this.t('editor.optionPlaceholder')}">
                    ${q.options.length > 2 ? `
                      <button type="button" class="egg-btn egg-btn-sm btn-del-option" style="color:red;">✕</button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
              <button type="button" class="egg-btn egg-btn-sm btn-add-option" data-qindex="${idx}" style="margin-top:8px;">
                ${this.t('editor.btnAddOption')}
              </button>
            </div>
          `;
        } else if (q.type === 'open_ended') {
          optionsHtml = `
            <div style="margin-top:14px; background:#F0FDF4; border:2px dashed #00E676; border-radius:14px; padding:16px;">
              <div style="font-weight:800; font-size:15px; color:#065F46; margin-bottom:8px;">
                ${this.t('editor.openEndedConfig')}
              </div>
              <div style="display:flex; gap:20px; font-weight:700; font-size:14px;">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <input type="checkbox" class="chk-allow-text" ${q.allowText !== false ? 'checked' : ''}>
                  ${this.t('editor.allowText')}
                </label>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <input type="checkbox" class="chk-allow-voice" ${q.allowVoice !== false ? 'checked' : ''}>
                  ${this.t('editor.allowVoice')}
                </label>
              </div>
            </div>
          `;
        }

        qBox.innerHTML = `
          <div class="question-box-header">
            <span class="question-num-badge">${this.t('editor.questionNum', { n: idx + 1 })}</span>
            <div style="display:flex; gap:8px;">
              ${surveyData.questions.length > 1 ? `
                <button type="button" class="egg-btn egg-btn-sm btn-del-question" data-qindex="${idx}" style="color:red;">
                  ${this.t('editor.btnDeleteQuestion')}
                </button>
              ` : ''}
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:12px; margin-bottom:12px;">
            <div>
              <label class="editor-label">${this.t('editor.questionTitle')}</label>
              <input type="text" class="editor-input q-title-input" value="${this.escapeHtml(q.title)}" placeholder="${this.t('editor.questionTitlePlaceholder')}">
            </div>
            <div>
              <label class="editor-label">${this.t('editor.questionType')}</label>
              <select class="editor-select q-type-select" data-qindex="${idx}">
                <option value="single" ${q.type === 'single' ? 'selected' : ''}>${this.t('editor.typeSingle')}</option>
                <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>${this.t('editor.typeMultiple')}</option>
                <option value="open_ended" ${q.type === 'open_ended' ? 'selected' : ''}>${this.t('editor.typeOpenEnded')}</option>
              </select>
            </div>
            <div>
              <label class="editor-label">${this.t('editor.obstacleType')}</label>
              <select class="editor-select q-obstacle-select">
                <option value="trampoline" ${q.obstacleType === 'trampoline' ? 'selected' : ''}>${this.t('editor.obstacleTrampoline')}</option>
                <option value="spinner" ${q.obstacleType === 'spinner' ? 'selected' : ''}>${this.t('editor.obstacleSpinner')}</option>
                <option value="rainbow" ${q.obstacleType === 'rainbow' ? 'selected' : ''}>${this.t('editor.obstacleRainbow')}</option>
              </select>
            </div>
          </div>
          ${optionsHtml}
        `;

        qListEl.appendChild(qBox);
      });

      // Bind dynamic question inputs
      qListEl.querySelectorAll('.q-title-input').forEach((input, i) => {
        input.addEventListener('input', (e) => {
          surveyData.questions[i].title = e.target.value;
        });
      });

      qListEl.querySelectorAll('.q-type-select').forEach((sel) => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt(sel.dataset.qindex, 10);
          const newType = e.target.value;
          surveyData.questions[idx].type = newType;
          if ((newType === 'single' || newType === 'multiple') && (!surveyData.questions[idx].options || surveyData.questions[idx].options.length === 0)) {
            surveyData.questions[idx].options = ['选项 A', '选项 B'];
          }
          if (newType === 'open_ended') {
            surveyData.questions[idx].allowVoice = true;
            surveyData.questions[idx].allowText = true;
          }
          renderQuestions();
        });
      });

      qListEl.querySelectorAll('.q-obstacle-select').forEach((sel, i) => {
        sel.addEventListener('change', (e) => {
          surveyData.questions[i].obstacleType = e.target.value;
        });
      });

      qListEl.querySelectorAll('.chk-allow-text').forEach((chk, i) => {
        chk.addEventListener('change', (e) => {
          surveyData.questions[i].allowText = e.target.checked;
        });
      });

      qListEl.querySelectorAll('.chk-allow-voice').forEach((chk, i) => {
        chk.addEventListener('change', (e) => {
          surveyData.questions[i].allowVoice = e.target.checked;
        });
      });

      qListEl.querySelectorAll('.opt-input').forEach((input) => {
        input.addEventListener('input', (e) => {
          const qBox = input.closest('.question-box');
          const qIdx = parseInt(qBox.dataset.qindex, 10);
          const optRow = input.closest('.option-row');
          const optIdx = parseInt(optRow.dataset.optindex, 10);
          surveyData.questions[qIdx].options[optIdx] = e.target.value;
        });
      });

      qListEl.querySelectorAll('.btn-add-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const qIdx = parseInt(btn.dataset.qindex, 10);
          const optCount = surveyData.questions[qIdx].options.length;
          surveyData.questions[qIdx].options.push(`新选项 ${String.fromCharCode(65 + optCount)}`);
          renderQuestions();
        });
      });

      qListEl.querySelectorAll('.btn-del-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const qBox = btn.closest('.question-box');
          const qIdx = parseInt(qBox.dataset.qindex, 10);
          const optRow = btn.closest('.option-row');
          const optIdx = parseInt(optRow.dataset.optindex, 10);
          surveyData.questions[qIdx].options.splice(optIdx, 1);
          renderQuestions();
        });
      });

      qListEl.querySelectorAll('.btn-del-question').forEach((btn) => {
        btn.addEventListener('click', () => {
          const qIdx = parseInt(btn.dataset.qindex, 10);
          surveyData.questions.splice(qIdx, 1);
          renderQuestions();
        });
      });
    };

    renderQuestions();

    document.getElementById('btn-add-question')?.addEventListener('click', () => {
      surveyData.questions.push({
        id: 'q_' + Date.now(),
        type: 'single',
        title: `关卡 ${surveyData.questions.length + 1} 问题`,
        obstacleType: 'trampoline',
        options: ['选项 A', '选项 B']
      });
      renderQuestions();
    });

    // Save action
    const saveSurveyHandler = async (andPublish = false) => {
      const title = document.getElementById('edit-survey-title').value.trim();
      const description = document.getElementById('edit-survey-desc').value.trim();
      const theme = document.getElementById('edit-survey-theme').value;

      if (!title) {
        this.showToast('请填写问卷标题！');
        return;
      }

      if (surveyData.questions.length === 0) {
        this.showToast('请至少添加一个题目！');
        return;
      }

      for (let i = 0; i < surveyData.questions.length; i++) {
        const q = surveyData.questions[i];
        if (!q.title.trim()) {
          this.showToast(`第 ${i + 1} 关的题目标题不能为空！`);
          return;
        }
      }

      const payload = {
        title,
        description,
        theme,
        questions: surveyData.questions
      };

      try {
        let result;
        if (surveyId) {
          result = await window.api.updateSurvey(surveyId, payload);
          this.showToast('问卷已成功更新！');
        } else {
          result = await window.api.createSurvey(payload);
          this.showToast('问卷创建成功！');
        }

        if (andPublish && result) {
          await window.api.togglePublishSurvey(result.id);
          this.openShareModal(result.shareCode);
        } else {
          this.navigateTo('#/');
        }
      } catch (err) {
        this.showToast(err.message);
      }
    };

    document.getElementById('btn-save-survey')?.addEventListener('click', () => saveSurveyHandler(false));
    document.getElementById('btn-save-and-publish')?.addEventListener('click', () => saveSurveyHandler(true));
  }

  // ================= VIEW: RESULTS & ANALYTICS (查看问卷调查结果) =================
  async renderResultsView(surveyId) {
    this.currentView = 'results';
    const mainContainer = document.getElementById('app-root');

    if (!this.currentUser) {
      this.openAuthModal(() => this.renderResultsView(surveyId));
      return;
    }

    mainContainer.innerHTML = `
      <div class="main-wrapper">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
          <h2 class="section-title">
            <span>📊 闯关数据与结果分析</span>
          </h2>
          <div style="display:flex; gap:10px;">
            <button class="egg-btn egg-btn-sm egg-btn-mint" id="btn-export-csv">
              ${this.t('results.btnExportCsv')}
            </button>
            <button class="egg-btn egg-btn-sm" onclick="window.location.hash='#/'">
              ${this.t('results.btnBack')}
            </button>
          </div>
        </div>

        <div id="results-content-container">
          <div style="text-align:center; padding:40px; font-weight:700; color:#718096;">
            正在汇总统计数据...
          </div>
        </div>
      </div>
    `;

    try {
      const data = await window.api.getSurveyResults(surveyId);
      const container = document.getElementById('results-content-container');
      if (!container) return;

      const { survey, totalSubmissions, avgTimeSpent, questionStats } = data;

      let html = `
        <!-- Survey Header Card -->
        <div class="egg-card" style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <h2 style="font-size:24px; font-weight:900; color:#1A202C; margin-bottom:6px;">
                ${this.escapeHtml(survey.title)}
              </h2>
              <p style="color:#718096; font-size:14px; font-weight:600;">
                ${this.escapeHtml(survey.description || '')}
              </p>
            </div>
            <button class="egg-btn egg-btn-sm egg-btn-primary" id="btn-share-from-results">
              🔗 分享
            </button>
          </div>
        </div>

        <!-- Metric Badges -->
        <div class="stats-header-grid">
          <div class="stat-metric-card">
            <div class="stat-metric-label">${this.t('results.metricTotal')}</div>
            <div class="stat-metric-val">${totalSubmissions} <span style="font-size:16px;">人</span></div>
          </div>
          <div class="stat-metric-card">
            <div class="stat-metric-label">${this.t('results.metricTime')}</div>
            <div class="stat-metric-val">${avgTimeSpent} <span style="font-size:16px;">s</span></div>
          </div>
          <div class="stat-metric-card">
            <div class="stat-metric-label">${this.t('results.metricQuestions')}</div>
            <div class="stat-metric-val">${questionStats ? questionStats.length : 0}</div>
          </div>
          <div class="stat-metric-card">
            <div class="stat-metric-label">${this.t('results.metricShareCode')}</div>
            <div class="stat-metric-val" style="color:#FF5376; font-size:22px;">${survey.shareCode}</div>
          </div>
        </div>
      `;

      // Question breakdown
      html += '<div class="section-header"><h3 class="section-title"><span>📈 各关卡回答详情</span></h3></div>';

      questionStats.forEach((qs, qIdx) => {
        html += `
          <div class="egg-card" style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <div style="font-size:18px; font-weight:900; color:#2D3748;">
                <span class="question-num-badge">关卡 ${qIdx + 1}</span>
                <span style="margin-left:8px;">${this.escapeHtml(qs.title)}</span>
              </div>
              <span style="font-size:13px; font-weight:800; color:#718096;">
                ${qs.type === 'single' ? '单选' : (qs.type === 'multiple' ? '多选' : '开放性问答')} · ${qs.answeredCount} 人作答
              </span>
            </div>
        `;

        if (qs.type === 'single' || qs.type === 'multiple') {
          html += `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items:center;">
              <div class="chart-wrapper">
                <canvas id="chart-canvas-${qIdx}"></canvas>
              </div>
              <div>
                ${qs.options.map((opt, oIdx) => `
                  <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; font-weight:800; font-size:14px; margin-bottom:4px;">
                      <span>${String.fromCharCode(65 + oIdx)}. ${this.escapeHtml(opt.text)}</span>
                      <span>${opt.count} 票 (${opt.percentage}%)</span>
                    </div>
                    <div style="height:12px; background:#EDF2F7; border:1.5px solid #2D3748; border-radius:9999px; overflow:hidden;">
                      <div style="height:100%; width:${opt.percentage}%; background:linear-gradient(90deg, #FFD23F, #FF5376); border-radius:9999px;"></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        } else if (qs.type === 'open_ended') {
          if (!qs.responses || qs.responses.length === 0) {
            html += `<div style="text-align:center; padding:20px; color:#A0AEC0; font-weight:700;">暂无玩家留言</div>`;
          } else {
            html += '<div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">';
            qs.responses.forEach(r => {
              html += `
                <div class="audio-answer-item">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:50%; background:${r.eggCustom?.color || '#FFD23F'}; border:2px solid #2D3748; display:flex; align-items:center; justify-content:center; font-size:18px;">
                      🐣
                    </div>
                    <div>
                      <div style="font-weight:900; font-size:14px; color:#2D3748;">
                        ${this.escapeHtml(r.playerNickname)}
                        <span style="font-size:11px; font-weight:600; color:#A0AEC0; margin-left:6px;">
                          ${new Date(r.completedAt).toLocaleString()}
                        </span>
                      </div>
                      ${r.text ? `
                        <div style="font-size:14px; color:#4A5568; margin-top:3px; font-weight:600;">
                          ${this.escapeHtml(r.text)}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <div>
                    ${r.audioUrl ? `
                      <audio controls src="${r.audioUrl}" style="height:36px; vertical-align:middle;"></audio>
                    ` : `
                      <span style="font-size:12px; color:#718096; font-weight:700;">文字回答</span>
                    `}
                  </div>
                </div>
              `;
            });
            html += '</div>';
          }
        }

        html += '</div>';
      });

      container.innerHTML = html;

      // Bind share button
      document.getElementById('btn-share-from-results')?.addEventListener('click', () => {
        this.openShareModal(survey.shareCode);
      });

      // Export CSV handler
      document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        this.exportResultsToCsv(data);
      });

      // Render Charts with Chart.js
      questionStats.forEach((qs, qIdx) => {
        if (qs.type === 'single' || qs.type === 'multiple') {
          const canvas = document.getElementById(`chart-canvas-${qIdx}`);
          if (canvas && window.Chart) {
            const labels = qs.options.map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o.text}`);
            const counts = qs.options.map(o => o.count);
            const colors = ['#FFD23F', '#FF5376', '#00E5FF', '#00E676', '#9B51E0', '#FF9AA2'];

            new window.Chart(canvas, {
              type: qs.type === 'single' ? 'doughnut' : 'bar',
              data: {
                labels,
                datasets: [{
                  data: counts,
                  backgroundColor: colors.slice(0, labels.length),
                  borderWidth: 2,
                  borderColor: '#2D3748'
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: qs.type === 'single',
                    position: 'bottom'
                  }
                }
              }
            });
          }
        }
      });

    } catch (err) {
      console.error(err);
      const container = document.getElementById('results-content-container');
      if (container) container.innerHTML = `<div class="egg-card" style="color:red;">加载失败: ${err.message}</div>`;
    }
  }

  exportResultsToCsv(data) {
    const { survey, questionStats, rawResponses } = data;
    let csv = '\uFEFF'; // UTF-8 BOM for Excel Chinese support
    csv += `问卷名称,${survey.title}\n`;
    csv += `分享码,${survey.shareCode}\n`;
    csv += `总提交人数,${data.totalSubmissions}\n\n`;

    // Question summary
    csv += '关卡编号,题目标题,题目类型,回答选项,选择人数,占比\n';
    questionStats.forEach((qs, idx) => {
      if (qs.type === 'single' || qs.type === 'multiple') {
        qs.options.forEach(opt => {
          csv += `关卡 ${idx + 1},"${qs.title.replace(/"/g, '""')}",${qs.type},"${opt.text.replace(/"/g, '""')}",${opt.count},${opt.percentage}%\n`;
        });
      } else {
        csv += `关卡 ${idx + 1},"${qs.title.replace(/"/g, '""')}",开放式问答,共 ${qs.answeredCount} 条留言,-,-\n`;
      }
    });

    // Download blob
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `蛋仔问卷_调研结果_${survey.shareCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('CSV 报告已成功导出！');
  }

  // ================= VIEW: ADMIN DASHBOARD (平台管理后台) =================
  async renderAdminView() {
    this.currentView = 'admin';
    const mainContainer = document.getElementById('app-root');

    // Auth verification
    if (!this.currentUser) {
      this.openAuthModal(() => this.renderAdminView());
      return;
    }

    if (this.currentUser.role !== 'admin' && this.currentUser.username !== 'admin') {
      this.showToast('权限不足：仅管理员账号可进入后台');
      this.navigateTo('#/');
      return;
    }

    mainContainer.innerHTML = `
      <div class="main-wrapper">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
          <h2 class="section-title">
            <span>${this.t('admin.title')}</span>
            <span class="badge-role-admin">${this.t('admin.badge')}</span>
          </h2>
          <div style="display:flex; gap:10px;">
            <button class="egg-btn egg-btn-sm egg-btn-mint" id="admin-btn-create-user">
              ${this.t('admin.btnAddUser')}
            </button>
            <a class="egg-btn egg-btn-sm" href="#/">
              🏠 返回主站
            </a>
          </div>
        </div>

        <!-- Top Navigation Tabs -->
        <div class="admin-tab-bar">
          <button class="admin-tab-btn active" data-tab="overview">${this.t('admin.tabOverview')}</button>
          <button class="admin-tab-btn" data-tab="users">${this.t('admin.tabUsers')}</button>
          <button class="admin-tab-btn" data-tab="surveys">${this.t('admin.tabSurveys')}</button>
        </div>

        <!-- Tab Content Container -->
        <div id="admin-tab-content">
          <div style="text-align:center; padding:40px; font-weight:700; color:#718096;">
            正在读取管理数据...
          </div>
        </div>
      </div>
    `;

    // Bind tab switching
    let currentTab = 'overview';
    const tabBtns = mainContainer.querySelectorAll('.admin-tab-btn');
    const switchTab = (tab) => {
      currentTab = tab;
      tabBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      if (tab === 'overview') this.loadAdminOverview();
      else if (tab === 'users') this.loadAdminUsers();
      else if (tab === 'surveys') this.loadAdminSurveys();
    };

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('admin-btn-create-user')?.addEventListener('click', () => {
      this.openAdminUserModal(null, () => {
        if (currentTab === 'users') this.loadAdminUsers();
        else if (currentTab === 'overview') this.loadAdminOverview();
      });
    });

    // Default load overview
    this.loadAdminOverview();
  }

  async loadAdminOverview() {
    const container = document.getElementById('admin-tab-content');
    if (!container) return;
    try {
      const data = await window.api.getAdminOverview();
      container.innerHTML = `
        <div class="stats-header-grid">
          <div class="stat-metric-card">
            <div class="stat-metric-label">👥 平台注册用户总数</div>
            <div class="stat-metric-val">${data.totalUsers} <span style="font-size:16px;">人</span></div>
          </div>
          <div class="stat-metric-card">
            <div class="stat-metric-label">📋 全平台创建问卷总数</div>
            <div class="stat-metric-val">${data.totalSurveys} <span style="font-size:16px;">份</span></div>
          </div>
          <div class="stat-metric-card">
            <div class="stat-metric-label">🌐 线上开放中问卷</div>
            <div class="stat-metric-val">${data.publishedSurveys} <span style="font-size:16px;">份</span></div>
          </div>
          <div class="stat-metric-card">
            <div class="stat-metric-label">🎮 累计闯关通关人次</div>
            <div class="stat-metric-val" style="color:#00E676;">${data.totalResponses} <span style="font-size:16px;">次</span></div>
          </div>
        </div>

        <div class="egg-card" style="margin-top:20px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px; color:#2D3748;">
            ⚡ 平台管理员快捷入口
          </h3>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="egg-btn egg-btn-primary" id="btn-quick-goto-users">
              👥 查看并管理注册用户
            </button>
            <button class="egg-btn egg-btn-blue" id="btn-quick-goto-surveys">
              📋 审查并管理所有问卷
            </button>
            <button class="egg-btn egg-btn-pink" onclick="window.location.hash='#/editor'">
              ✨ 以管理员身份创建官方关卡
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-quick-goto-users')?.addEventListener('click', () => {
        document.querySelector('.admin-tab-btn[data-tab="users"]')?.click();
      });
      document.getElementById('btn-quick-goto-surveys')?.addEventListener('click', () => {
        document.querySelector('.admin-tab-btn[data-tab="surveys"]')?.click();
      });
    } catch (err) {
      container.innerHTML = `<div class="egg-card" style="color:red;">加载失败: ${err.message}</div>`;
    }
  }

  async loadAdminUsers() {
    const container = document.getElementById('admin-tab-content');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center; padding:30px; font-weight:700; color:#718096;">正在加载用户列表...</div>`;

    try {
      const users = await window.api.getAdminUsers();
      let filterText = '';

      const renderTable = () => {
        const filtered = users.filter(u => {
          if (!filterText) return true;
          const kw = filterText.toLowerCase();
          return (u.username || '').toLowerCase().includes(kw) || (u.nickname || '').toLowerCase().includes(kw);
        });

        let tableHtml = `
          <div class="admin-search-bar">
            <input type="text" id="admin-user-search" class="editor-input" placeholder="🔍 搜索用户名或昵称..." value="${this.escapeHtml(filterText)}" style="max-width:320px;">
            <span style="font-size:13px; font-weight:700; color:#718096;">共 ${filtered.length} 个用户</span>
          </div>

          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>蛋仔外观</th>
                  <th>用户名</th>
                  <th>昵称</th>
                  <th>角色权限</th>
                  <th>创建问卷数</th>
                  <th>收集答卷数</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
        `;

        if (filtered.length === 0) {
          tableHtml += `<tr><td colspan="8" style="text-align:center; padding:24px; color:#A0AEC0;">无匹配用户</td></tr>`;
        } else {
          filtered.forEach(u => {
            const isAdmin = (u.role === 'admin' || u.username === 'admin');
            tableHtml += `
              <tr>
                <td>
                  <div style="width:34px; height:34px; border-radius:50%; background:${u.avatarColor}; border:2px solid #2D3748; display:flex; align-items:center; justify-content:center; font-size:18px;">
                    🐣
                  </div>
                </td>
                <td style="font-weight:800;">${this.escapeHtml(u.username)}</td>
                <td>${this.escapeHtml(u.nickname || '-')}</td>
                <td>
                  <span class="${isAdmin ? 'badge-role-admin' : 'badge-role-user'}">
                    ${isAdmin ? '超级管理员' : '普通创作者'}
                  </span>
                </td>
                <td style="font-weight:700;">${u.surveysCount} 份</td>
                <td style="font-weight:700;">${u.responsesCount} 人次</td>
                <td style="color:#718096; font-size:12px;">${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="egg-btn egg-btn-sm btn-edit-user" data-id="${u.id}" title="编辑用户/重置密码">
                      ✏️ 编辑
                    </button>
                    ${u.username !== 'admin' ? `
                      <button class="egg-btn egg-btn-sm btn-del-user" data-id="${u.id}" data-name="${u.username}" style="color:#E53E3E;" title="删除用户">
                        🗑️ 删除
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
          });
        }

        tableHtml += `</tbody></table></div>`;
        container.innerHTML = tableHtml;

        // Search bind
        const searchInput = document.getElementById('admin-user-search');
        if (searchInput) {
          searchInput.focus();
          searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
          searchInput.addEventListener('input', (e) => {
            filterText = e.target.value;
            renderTable();
          });
        }

        // Action binds
        container.querySelectorAll('.btn-edit-user').forEach(btn => {
          btn.addEventListener('click', () => {
            const userToEdit = users.find(x => x.id === btn.dataset.id);
            if (userToEdit) {
              this.openAdminUserModal(userToEdit, () => this.loadAdminUsers());
            }
          });
        });

        container.querySelectorAll('.btn-del-user').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (confirm(`确定要删除用户【${btn.dataset.name}】吗？该用户创建的所有问卷也将一并删除。`)) {
              try {
                await window.api.deleteAdminUser(btn.dataset.id);
                this.showToast('用户已删除');
                this.loadAdminUsers();
              } catch (err) {
                this.showToast(err.message);
              }
            }
          });
        });
      };

      renderTable();
    } catch (err) {
      container.innerHTML = `<div class="egg-card" style="color:red;">加载失败: ${err.message}</div>`;
    }
  }

  async loadAdminSurveys() {
    const container = document.getElementById('admin-tab-content');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center; padding:30px; font-weight:700; color:#718096;">正在加载所有问卷...</div>`;

    try {
      const surveys = await window.api.getAdminSurveys();
      let filterText = '';

      const renderTable = () => {
        const filtered = surveys.filter(s => {
          if (!filterText) return true;
          const kw = filterText.toLowerCase();
          return (s.title || '').toLowerCase().includes(kw) ||
                 (s.shareCode || '').toLowerCase().includes(kw) ||
                 (s.author?.username || '').toLowerCase().includes(kw) ||
                 (s.author?.nickname || '').toLowerCase().includes(kw);
        });

        let tableHtml = `
          <div class="admin-search-bar">
            <input type="text" id="admin-survey-search" class="editor-input" placeholder="🔍 搜索问卷标题、作者或验证码..." value="${this.escapeHtml(filterText)}" style="max-width:320px;">
            <span style="font-size:13px; font-weight:700; color:#718096;">共 ${filtered.length} 份问卷</span>
          </div>

          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>验证码</th>
                  <th>问卷标题</th>
                  <th>创建者作者</th>
                  <th>关卡数</th>
                  <th>答题人数</th>
                  <th>当前状态</th>
                  <th>更新时间</th>
                  <th>管理操作</th>
                </tr>
              </thead>
              <tbody>
        `;

        if (filtered.length === 0) {
          tableHtml += `<tr><td colspan="8" style="text-align:center; padding:24px; color:#A0AEC0;">无匹配问卷</td></tr>`;
        } else {
          filtered.forEach(s => {
            tableHtml += `
              <tr>
                <td style="font-weight:900; color:#FF5376;">${s.shareCode}</td>
                <td style="font-weight:800; max-width:240px;">${this.escapeHtml(s.title)}</td>
                <td>
                  <span style="font-weight:700; color:#2D3748;">${this.escapeHtml(s.author?.nickname || s.author?.username || '未知')}</span>
                  <div style="font-size:11px; color:#A0AEC0;">@${this.escapeHtml(s.author?.username || '')}</div>
                </td>
                <td style="font-weight:700;">${s.questionsCount} 关</td>
                <td style="font-weight:700; color:#319795;">${s.responseCount} 人次</td>
                <td>
                  <span class="survey-status-tag ${s.published ? 'status-published' : 'status-draft'}">
                    ${s.published ? '已发布' : '草稿下线'}
                  </span>
                </td>
                <td style="color:#718096; font-size:12px;">${new Date(s.updatedAt || s.createdAt).toLocaleDateString()}</td>
                <td>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <a class="egg-btn egg-btn-sm egg-btn-primary" href="#/play/${s.shareCode}" target="_blank" title="试玩">
                      🎮 试玩
                    </a>
                    <a class="egg-btn egg-btn-sm egg-btn-blue" href="#/results/${s.id}" title="查看结果">
                      📊 统计
                    </a>
                    <button class="egg-btn egg-btn-sm btn-admin-toggle-pub" data-id="${s.id}">
                      ${s.published ? '下线' : '发布'}
                    </button>
                    <button class="egg-btn egg-btn-sm btn-admin-del-survey" data-id="${s.id}" data-title="${s.title}" style="color:#E53E3E;" title="删除">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            `;
          });
        }

        tableHtml += `</tbody></table></div>`;
        container.innerHTML = tableHtml;

        // Search bind
        const searchInput = document.getElementById('admin-survey-search');
        if (searchInput) {
          searchInput.focus();
          searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
          searchInput.addEventListener('input', (e) => {
            filterText = e.target.value;
            renderTable();
          });
        }

        // Action binds
        container.querySelectorAll('.btn-admin-toggle-pub').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              const res = await window.api.togglePublishAdminSurvey(btn.dataset.id);
              this.showToast(res.message);
              this.loadAdminSurveys();
            } catch (err) {
              this.showToast(err.message);
            }
          });
        });

        container.querySelectorAll('.btn-admin-del-survey').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (confirm(`确定要删除问卷【${btn.dataset.title}】吗？`)) {
              try {
                await window.api.deleteAdminSurvey(btn.dataset.id);
                this.showToast('问卷已删除');
                this.loadAdminSurveys();
              } catch (err) {
                this.showToast(err.message);
              }
            }
          });
        });
      };

      renderTable();
    } catch (err) {
      container.innerHTML = `<div class="egg-card" style="color:red;">加载失败: ${err.message}</div>`;
    }
  }

  openAdminUserModal(userData, onSuccess) {
    let modalEl = document.getElementById('admin-user-modal-container');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'admin-user-modal-container';
      document.body.appendChild(modalEl);
    }

    const isEdit = !!userData;

    modalEl.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog">
          <button class="modal-close-btn" id="btn-close-user-modal">✕</button>
          
          <h3 style="font-size:20px; font-weight:900; margin-bottom:14px; color:#1A202C;">
            ${isEdit ? '✏️ 编辑用户与重置密码' : '➕ 添加新注册用户'}
          </h3>

          <form id="admin-user-form">
            <div class="editor-form-group">
              <label class="editor-label">用户名 *</label>
              <input type="text" id="adm-user-name" class="editor-input" value="${this.escapeHtml(userData ? userData.username : '')}" ${isEdit ? 'disabled style="background:#EDF2F7;"' : 'required'}>
            </div>

            <div class="editor-form-group">
              <label class="editor-label">蛋仔昵称</label>
              <input type="text" id="adm-user-nick" class="editor-input" value="${this.escapeHtml(userData ? userData.nickname : '')}" placeholder="输入蛋仔昵称">
            </div>

            <div class="editor-form-group">
              <label class="editor-label">${isEdit ? '重置登录密码 (如无需修改请留空)' : '登录密码 *'}</label>
              <input type="password" id="adm-user-pass" class="editor-input" placeholder="${isEdit ? '留空表示不修改密码' : '设置初始登录密码 (至少4位)'}" ${isEdit ? '' : 'required'}>
            </div>

            <div class="editor-form-group">
              <label class="editor-label">角色权限</label>
              <select id="adm-user-role" class="editor-select">
                <option value="user" ${userData && userData.role === 'user' ? 'selected' : ''}>普通创作者</option>
                <option value="admin" ${userData && userData.role === 'admin' ? 'selected' : ''}>超级管理员</option>
              </select>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
              <button type="button" class="egg-btn egg-btn-sm" id="btn-cancel-user-modal">取消</button>
              <button type="submit" class="egg-btn egg-btn-sm egg-btn-primary">
                ${isEdit ? '💾 保存更新' : '✨ 确认创建'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('btn-close-user-modal')?.addEventListener('click', () => modalEl.innerHTML = '');
    document.getElementById('btn-cancel-user-modal')?.addEventListener('click', () => modalEl.innerHTML = '');

    document.getElementById('admin-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nickname = document.getElementById('adm-user-nick').value.trim();
      const role = document.getElementById('adm-user-role').value;
      const password = document.getElementById('adm-user-pass').value.trim();

      try {
        if (isEdit) {
          await window.api.updateAdminUser(userData.id, {
            nickname,
            role,
            password: password || undefined
          });
          this.showToast('用户信息已成功更新！');
        } else {
          const username = document.getElementById('adm-user-name').value.trim();
          if (!username || !password) {
            this.showToast('用户名和密码不能为空');
            return;
          }
          await window.api.createAdminUser({
            username,
            password,
            nickname,
            role
          });
          this.showToast('用户创建成功！');
        }

        modalEl.innerHTML = '';
        if (onSuccess) onSuccess();
      } catch (err) {
        this.showToast(err.message);
      }
    });
  }

  // ================= VIEW: 3D PLAY GAME ARENA ( 闯关游戏) =================
  async renderPlayView(shareCode) {
    this.currentView = 'play';
    const mainContainer = document.getElementById('app-root');

    mainContainer.innerHTML = `
      <div style="width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; background:#70d6ff; color:#FFF; font-size:20px; font-weight:800;">
        🐣 正在准备蛋仔赛道与机关...
      </div>
    `;

    try {
      const survey = await window.api.getPublicSurvey(shareCode);
      if (!survey) {
        throw new Error('问卷不存在或已下线');
      }

      // Check if user wants to customize egg first
      this.renderGameLobby(survey);
    } catch (err) {
      mainContainer.innerHTML = `
        <div class="main-wrapper" style="text-align:center; padding-top:60px;">
          <div class="egg-card">
            <div style="font-size:60px; margin-bottom:12px;">🐣💔</div>
            <h2 style="font-size:22px; font-weight:900; margin-bottom:10px;">哎呀，关卡赛道暂时无法进入</h2>
            <p style="color:#718096; margin-bottom:20px;">${this.escapeHtml(err.message)}</p>
            <a class="egg-btn egg-btn-primary" href="#/">返回首页</a>
          </div>
        </div>
      `;
    }
  }

  renderGameLobby(survey) {
    const mainContainer = document.getElementById('app-root');

    const defaultNames = ['飞天皮蛋', '跳跳粉蛋', '机智小绿', '暴走小黑', '软萌蓝蛋'];
    const randomName = defaultNames[Math.floor(Math.random() * defaultNames.length)];

    let selectedColor = '#FFD23F';
    let selectedHat = 'propeller';

    mainContainer.innerHTML = `
      <div class="main-wrapper" style="max-width:540px; padding-top:40px;">
        <div class="egg-card" style="text-align:center;">
          <div style="font-size:48px; margin-bottom:8px;">🐣🎮</div>
          <h2 style="font-size:24px; font-weight:900; color:#1A202C; margin-bottom:8px;">
            ${this.escapeHtml(survey.title)}
          </h2>
          <p style="color:#718096; font-size:14px; font-weight:600; margin-bottom:24px;">
            ${this.t('game.lobbyDesc', { title: survey.title })}
          </p>

          <!-- Customizer -->
          <div style="background:#FFF9E6; border:2.5px solid #2D3748; border-radius:20px; padding:20px; margin-bottom:20px; text-align:left;">
            <label class="editor-label">${this.t('game.nicknameLabel')}</label>
            <input type="text" id="player-nickname" class="editor-input" value="${randomName}" placeholder="${this.t('game.nicknamePlaceholder')}" style="margin-bottom:16px;">

            <label class="editor-label">${this.t('game.bodyColorLabel')}</label>
            <div style="display:flex; gap:12px; margin-bottom:16px;">
              ${['#FFD23F', '#FF5376', '#00E5FF', '#00E676', '#2D3748'].map(c => `
                <div class="color-pick-circle ${c === selectedColor ? 'selected' : ''}" 
                  data-color="${c}"
                  style="width:38px; height:38px; border-radius:50%; background:${c}; border:3px solid #2D3748; cursor:pointer; box-shadow:0 3px 0 #2D3748;"></div>
              `).join('')}
            </div>

            <label class="editor-label">${this.t('game.hatLabel')}</label>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
              ${[
                { id: 'propeller', name: `${this.t('game.hatPropeller')} 🚁` },
                { id: 'crown', name: `${this.t('game.hatCrown')} 👑` },
                { id: 'bunny', name: `${this.t('game.hatBunny')} 🐰` },
                { id: 'glasses', name: `${this.t('game.hatGlasses')} 😎` }
              ].map(h => `
                <button type="button" class="egg-btn egg-btn-sm btn-hat-pick ${h.id === selectedHat ? 'egg-btn-primary' : ''}" data-hat="${h.id}">
                  ${h.name}
                </button>
              `).join('')}
            </div>
          </div>

          <button class="egg-btn egg-btn-pink" id="btn-start-adventure" style="width:100%; font-size:18px; padding:14px;">
            ${this.t('game.btnStartGame')}
          </button>
        </div>
      </div>
    `;

    // Bind lobby interactions
    mainContainer.querySelectorAll('.color-pick-circle').forEach(el => {
      el.addEventListener('click', () => {
        mainContainer.querySelectorAll('.color-pick-circle').forEach(c => c.style.outline = 'none');
        el.style.outline = '4px solid #FF5376';
        selectedColor = el.dataset.color;
      });
    });

    mainContainer.querySelectorAll('.btn-hat-pick').forEach(el => {
      el.addEventListener('click', () => {
        mainContainer.querySelectorAll('.btn-hat-pick').forEach(b => b.classList.remove('egg-btn-primary'));
        el.classList.add('egg-btn-primary');
        selectedHat = el.dataset.hat;
      });
    });

    document.getElementById('btn-start-adventure')?.addEventListener('click', () => {
      const nickname = document.getElementById('player-nickname').value.trim() || randomName;
      this.launch3DGame(survey, {
        nickname,
        eggConfig: {
          color: selectedColor,
          hat: selectedHat
        }
      });
    });
  }

  launch3DGame(survey, playerConfig) {
    const mainContainer = document.getElementById('app-root');
    const startTime = Date.now();
    const collectedAnswers = {};

    mainContainer.innerHTML = `
      <div class="game-viewport-container">
        <!-- Three.js Canvas -->
        <div id="three-canvas-container"></div>

        <!-- Game Top HUD -->
        <div class="game-hud">
          <div class="hud-pill hud-interactive">
            <span id="hud-level-indicator">🚩 关卡 1/${survey.questions.length}</span>
          </div>

          <div class="hud-progress-bar-container">
            <div class="hud-progress-fill" id="hud-progress-fill" style="width:10%;"></div>
          </div>

          <div style="display:flex; gap:10px;" class="hud-interactive">
            <div class="hud-pill">
              ⭐ <span id="hud-score-display">0</span>
            </div>
            <button class="egg-btn egg-btn-sm egg-btn-icon" id="btn-game-sound" title="音效">
              🔊
            </button>
            <button class="egg-btn egg-btn-sm egg-btn-icon" id="btn-quit-game" title="退出">
              ✕
            </button>
          </div>
        </div>

        <!-- Desktop Controls Hint -->
        <div class="desktop-controls-hint">
          ${this.t('game.hudControls')}
        </div>

        <!-- Mobile Left-Screen Dynamic Floating Touch Zone -->
        <div class="mobile-touch-left-zone" id="mobile-touch-left-zone"></div>

        <!-- Mobile Dynamic Joystick & Jump Button -->
        <div class="mobile-joystick-zone" id="mobile-joystick">
          <div class="joystick-thumb" id="joystick-thumb"></div>
        </div>
        <div class="mobile-jump-btn" id="mobile-jump-btn">
          <span class="jump-icon">🚀</span>
          <span>JUMP</span>
        </div>

        <!-- Modal Container for Questions & Victory -->
        <div id="game-modal-layer"></div>
      </div>
    `;

    // Sound toggle
    document.getElementById('btn-game-sound')?.addEventListener('click', (e) => {
      const enabled = window.soundEngine.toggleSound();
      e.target.textContent = enabled ? '🔊' : '🔇';
    });

    // Quit game
    document.getElementById('btn-quit-game')?.addEventListener('click', () => {
      if (confirm('确定要退出当前闯关吗？')) {
        this.navigateTo('#/');
      }
    });

    // --- Mobile Touch Dynamic Floating Joystick ---
    const touchArea = document.getElementById('mobile-touch-left-zone');
    const joystickZone = document.getElementById('mobile-joystick');
    const joystickThumb = document.getElementById('joystick-thumb');
    let touchId = null;
    let originX = 0;
    let originY = 0;

    const startJoystick = (touch) => {
      touchId = touch.identifier;
      originX = touch.clientX;
      originY = touch.clientY;

      // Position the joystick base right under the player's thumb!
      if (joystickZone) {
        joystickZone.style.left = `${originX - 65}px`;
        joystickZone.style.top = `${originY - 65}px`;
        joystickZone.style.bottom = 'auto';
        joystickZone.classList.add('active');
      }
      if (joystickThumb) {
        joystickThumb.style.transform = 'translate(0px, 0px)';
      }
      if (navigator.vibrate) navigator.vibrate(10);
    };

    const moveJoystick = (touch) => {
      let dx = touch.clientX - originX;
      let dy = touch.clientY - originY;
      const dist = Math.hypot(dx, dy);
      const maxDist = 45;

      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }

      if (joystickThumb) {
        joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      if (this.activeGame) {
        this.activeGame.setJoystick(dx / maxDist, dy / maxDist);
      }
    };

    const stopJoystick = () => {
      touchId = null;
      if (joystickZone) {
        joystickZone.classList.remove('active');
        joystickZone.style.left = '30px';
        joystickZone.style.top = 'auto';
        joystickZone.style.bottom = '30px';
      }
      if (joystickThumb) {
        joystickThumb.style.transform = 'translate(0px, 0px)';
      }
      if (this.activeGame) {
        this.activeGame.setJoystick(0, 0);
      }
    };

    if (touchArea) {
      touchArea.addEventListener('touchstart', (e) => {
        if (touchId === null && e.changedTouches.length > 0) {
          startJoystick(e.changedTouches[0]);
        }
      }, { passive: false });

      touchArea.addEventListener('touchmove', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            moveJoystick(e.changedTouches[i]);
            break;
          }
        }
      }, { passive: false });

      touchArea.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            stopJoystick();
            break;
          }
        }
      });

      touchArea.addEventListener('touchcancel', stopJoystick);
    }

    // --- Mobile Jump Button ---
    const jumpBtn = document.getElementById('mobile-jump-btn');
    if (jumpBtn) {
      const triggerJump = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (navigator.vibrate) navigator.vibrate(20);
        if (this.activeGame) this.activeGame.jump();
      };
      jumpBtn.addEventListener('touchstart', triggerJump, { passive: false });
      jumpBtn.addEventListener('click', triggerJump);
    }

    // Instantiate 3D Game
    const container = document.getElementById('three-canvas-container');
    const GameEngine = EggPartyGameClass || window.EggPartyGame;

    if (!GameEngine) {
      this.showToast('3D 引擎加载异常，正在重试...');
      return;
    }

    this.activeGame = new GameEngine(container, {
      survey,
      eggConfig: playerConfig.eggConfig,
      onCollectStar: (score) => {
        const el = document.getElementById('hud-score-display');
        if (el) el.textContent = score;
      },
      onLevelReach: (levelIndex, question) => {
        this.openQuestionGateModal(survey, levelIndex, question, (answerData) => {
          collectedAnswers[question.id] = answerData;
          this.activeGame.passCurrentLevel();

          // Update HUD
          const indEl = document.getElementById('hud-level-indicator');
          if (indEl) {
            if (levelIndex + 1 >= survey.questions.length) {
              indEl.textContent = '🏆 直达终点大通关！';
            } else {
              const nextIdx = levelIndex + 2;
              indEl.textContent = `🚩 关卡 ${nextIdx}/${survey.questions.length}`;
            }
          }

          const fillEl = document.getElementById('hud-progress-fill');
          if (fillEl) fillEl.style.width = `${((levelIndex + 1) / survey.questions.length) * 100}%`;
        });
      },
      onGameFinish: async (score) => {
        const timeSpent = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        try {
          // Submit answers to backend
          await window.api.submitGameResponse(survey.shareCode, {
            playerNickname: playerConfig.nickname,
            eggCustom: playerConfig.eggConfig,
            answers: collectedAnswers,
            timeSpentSeconds: timeSpent
          });
        } catch (e) {
          console.error('Submit response failed:', e);
        }

        this.openVictoryModal(survey, score, timeSpent);
      }
    });
  }

  // Question Modal that pops up at each gate
  openQuestionGateModal(survey, levelIndex, question, onPass) {
    const modalLayer = document.getElementById('game-modal-layer');
    if (!modalLayer) return;

    let selectedChoices = [];
    let textAnswer = '';
    let voiceBlob = null;
    let voiceBase64 = null;
    let voiceTranscript = '';

    const typeBadge = question.type === 'single' 
      ? this.t('game.typeSingleBadge') 
      : (question.type === 'multiple' ? this.t('game.typeMultipleBadge') : this.t('game.typeVoiceBadge'));

    let bodyHtml = '';

    if (question.type === 'single') {
      bodyHtml = `
        <p style="font-size:14px; color:#718096; font-weight:700; margin-bottom:12px;">
          ${this.t('game.questionGatePromptSingle')}
        </p>
        <div class="options-selection-list">
          ${(question.options || []).map((opt, idx) => `
            <button type="button" class="choice-option-btn" data-opt="${idx}">
              <span class="choice-letter">${String.fromCharCode(65 + idx)}</span>
              <span>${this.escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
      `;
    } else if (question.type === 'multiple') {
      bodyHtml = `
        <p style="font-size:14px; color:#718096; font-weight:700; margin-bottom:12px;">
          ${this.t('game.questionGatePromptMulti')}
        </p>
        <div class="options-selection-list">
          ${(question.options || []).map((opt, idx) => `
            <button type="button" class="choice-option-btn" data-opt="${idx}">
              <span class="choice-letter">${String.fromCharCode(65 + idx)}</span>
              <span>${this.escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
        <button type="button" class="egg-btn egg-btn-pink" id="btn-confirm-multi" style="width:100%; margin-top:14px;">
          ${this.t('game.btnConfirmAnswer')}
        </button>
      `;
    } else if (question.type === 'open_ended') {
      bodyHtml = `
        <p style="font-size:14px; color:#718096; font-weight:700; margin-bottom:12px;">
          ${this.t('game.questionGatePromptVoice')}
        </p>
        <!-- Voice input mode -->
        ${question.allowVoice !== false ? `
          <div class="voice-input-card">
            <div style="font-weight:900; font-size:15px; color:#0284C7; margin-bottom:6px;">
              ${this.t('game.voiceTipHold')}
            </div>
            <canvas class="voice-wave-canvas" id="voice-canvas" width="300" height="48"></canvas>
            <div style="display:flex; justify-content:center; align-items:center; gap:16px;">
              <button type="button" class="voice-mic-btn" id="btn-voice-mic">🎤</button>
            </div>
            <div id="voice-status-text" style="font-size:13px; font-weight:800; color:#FF5376; margin-top:8px;">
              ${this.t('game.voiceTipHold')}
            </div>
          </div>
        ` : ''}

        <!-- Text input mode -->
        ${question.allowText !== false ? `
          <div style="margin-bottom:14px;">
            <textarea id="modal-text-input" class="editor-textarea" rows="3" placeholder="${this.t('game.textPlaceholder')}"></textarea>
          </div>
        ` : ''}

        <button type="button" class="egg-btn egg-btn-pink" id="btn-submit-open" style="width:100%; margin-top:10px;">
          ${this.t('game.btnSubmitOpenEnded')}
        </button>
      `;
    }

    modalLayer.innerHTML = `
      <div class="question-modal-backdrop">
        <div class="question-modal-box">
          <div class="q-modal-badge">
            <span>${this.t('game.levelBadge', { n: levelIndex + 1 })} · ${typeBadge}</span>
          </div>
          <h2 class="q-modal-title">${this.escapeHtml(question.title)}</h2>
          ${bodyHtml}
        </div>
      </div>
    `;

    // --- Single Choice Handlers ---
    if (question.type === 'single') {
      modalLayer.querySelectorAll('.choice-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.classList.add('selected');
          const optIdx = parseInt(btn.dataset.opt, 10);
          if (window.soundEngine) window.soundEngine.playPop();

          setTimeout(() => {
            modalLayer.innerHTML = '';
            onPass({
              type: 'single',
              value: optIdx
            });
          }, 200);
        });
      });
    }

    // --- Multiple Choice Handlers ---
    if (question.type === 'multiple') {
      modalLayer.querySelectorAll('.choice-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const optIdx = parseInt(btn.dataset.opt, 10);
          if (selectedChoices.includes(optIdx)) {
            selectedChoices = selectedChoices.filter(x => x !== optIdx);
            btn.classList.remove('selected');
          } else {
            selectedChoices.push(optIdx);
            btn.classList.add('selected');
          }
          if (window.soundEngine) window.soundEngine.playPop();
        });
      });

      document.getElementById('btn-confirm-multi')?.addEventListener('click', () => {
        if (selectedChoices.length === 0) {
          this.showToast('请至少选择一个选项再通关哦！');
          return;
        }
        modalLayer.innerHTML = '';
        onPass({
          type: 'multiple',
          value: selectedChoices
        });
      });
    }

    // --- Open-Ended Question Handlers (Voice & Text) ---
    if (question.type === 'open_ended') {
      const micBtn = document.getElementById('btn-voice-mic');
      const statusText = document.getElementById('voice-status-text');
      const canvas = document.getElementById('voice-canvas');
      const textInput = document.getElementById('modal-text-input');

      let isRecording = false;

      if (micBtn) {
        micBtn.addEventListener('click', async () => {
          if (!isRecording) {
            // Start recording
            try {
              await window.voiceEngine.startRecording(canvas, (secs) => {
                if (statusText) statusText.textContent = `🔴 正在录音中... ${secs} 秒 (再次点击完成)`;
              }, (transcript) => {
                // Speech recognition live update
                voiceTranscript = transcript;
                if (textInput && !textInput.value) {
                  textInput.value = transcript;
                }
              });

              isRecording = true;
              micBtn.classList.add('recording');
              if (statusText) statusText.textContent = '🔴 正在录音中... (再次点击完成)';
            } catch (err) {
              this.showToast(err.message);
            }
          } else {
            // Stop recording
            const result = await window.voiceEngine.stopRecording();
            isRecording = false;
            micBtn.classList.remove('recording');
            voiceBlob = result.blob;
            voiceBase64 = result.base64;
            if (result.transcript) {
              voiceTranscript = result.transcript;
              if (textInput) textInput.value = result.transcript;
            }

            if (statusText) statusText.textContent = `✅ 录音完成 (${result.duration} 秒) · 可直接提交！`;
            if (window.soundEngine) window.soundEngine.playCoin();
          }
        });
      }

      document.getElementById('btn-submit-open')?.addEventListener('click', async () => {
        const textVal = textInput ? textInput.value.trim() : '';

        if (!textVal && !voiceBase64) {
          this.showToast('请打字输入或按住麦克风录音哦！');
          return;
        }

        let audioUrl = null;
        if (voiceBase64) {
          try {
            const uploadRes = await window.api.uploadAudio(voiceBase64, 'webm');
            audioUrl = uploadRes.audioUrl;
          } catch (e) {
            console.error('Audio upload error:', e);
          }
        }

        modalLayer.innerHTML = '';
        onPass({
          type: 'open_ended',
          mode: audioUrl ? 'voice' : 'text',
          text: textVal || voiceTranscript,
          audioUrl: audioUrl
        });
      });
    }
  }

  // Victory Celebration Modal
  openVictoryModal(survey, score, timeSpent) {
    const modalLayer = document.getElementById('game-modal-layer');
    if (!modalLayer) return;

    modalLayer.innerHTML = `
      <div class="question-modal-backdrop">
        <div class="victory-card">
          <div class="victory-trophy-img">🏆</div>
          <h2 class="victory-title">${this.t('game.victoryTitle')}</h2>
          <p style="color:#718096; font-size:16px; font-weight:700; margin-bottom:20px;">
            ${this.t('game.victoryDesc', { title: survey.title })}
          </p>

          <div style="background:#FFF9E6; border:2.5px solid #2D3748; border-radius:20px; padding:16px; margin-bottom:22px; display:flex; justify-content:space-around;">
            <div>
              <div style="font-size:13px; color:#718096; font-weight:800;">${this.t('game.statTimeSpent')}</div>
              <div style="font-size:22px; font-weight:900; color:#2D3748;">${timeSpent} s</div>
            </div>
            <div>
              <div style="font-size:13px; color:#718096; font-weight:800;">${this.t('game.statScore')}</div>
              <div style="font-size:22px; font-weight:900; color:#FF5376;">${score}</div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
            <button class="egg-btn egg-btn-pink" id="btn-victory-share">
              ${this.t('game.btnVictoryShare')}
            </button>
            <a class="egg-btn egg-btn-primary" href="#/">
              ${this.t('game.btnBackHome')}
            </a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-victory-share')?.addEventListener('click', () => {
      this.openShareModal(survey.shareCode);
    });
  }

  // ================= SHARE & FORWARD MODAL (问卷闯关可以转发) =================
  async openShareModal(shareCode) {
    let modalEl = document.getElementById('share-modal-container');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'share-modal-container';
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog" style="max-width:520px; text-align:center;">
          <button class="modal-close-btn" id="btn-close-share-modal">✕</button>
          
          <div style="font-size:40px; margin-bottom:6px;">🐣💌</div>
          <h2 style="font-size:22px; font-weight:900; margin-bottom:6px; color:#1A202C;">
            ${this.t('share.modalTitle')}
          </h2>
          <p style="font-size:14px; color:#718096; font-weight:600; margin-bottom:18px;">
            ${this.t('share.qrTip')}
          </p>

          <!-- QR Code Preview -->
          <div style="background:#FFF9E6; border:2.5px solid #2D3748; border-radius:20px; padding:20px; display:inline-block; margin-bottom:18px; box-shadow:0 4px 0 #2D3748;">
            <img id="share-qr-image" style="width:190px; height:190px; display:block; margin:0 auto; border-radius:12px;" alt="QR Code">
            <div style="font-size:13px; font-weight:800; color:#2D3748; margin-top:8px;">
              ${this.t('share.shareCodeLabel')} <span style="color:#FF5376;">${shareCode}</span>
            </div>
          </div>

          <!-- Link input and copy -->
          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <input type="text" id="share-link-input" class="editor-input" readonly style="font-size:13px;">
            <button class="egg-btn egg-btn-primary" id="btn-copy-link" style="white-space:nowrap;">
              ${this.t('share.btnCopyLink')}
            </button>
          </div>

          <!-- Forward Actions -->
          <div style="display:flex; gap:10px; justify-content:center;">
            <button class="egg-btn egg-btn-sm egg-btn-mint" id="btn-copy-forward-text">
              ${this.t('share.btnCopyForwardText')}
            </button>
            <button class="egg-btn egg-btn-sm egg-btn-blue" id="btn-download-poster">
              ${this.t('share.btnDownloadPoster')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-share-modal')?.addEventListener('click', () => {
      modalEl.innerHTML = '';
    });

    const playUrl = `${window.location.origin}/#/play/${shareCode}`;
    const linkInput = document.getElementById('share-link-input');
    if (linkInput) linkInput.value = playUrl;

    // Fetch live QR Code
    try {
      const qrRes = await window.api.getQrCode(shareCode);
      const img = document.getElementById('share-qr-image');
      if (img && qrRes.qrcode) {
        img.src = qrRes.qrcode;
      }
    } catch (e) {
      console.error(e);
    }

    // Copy link handler
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      navigator.clipboard.writeText(playUrl).then(() => {
        this.showToast(this.t('share.toastLinkCopied'));
      }).catch(() => {
        linkInput.select();
        document.execCommand('copy');
        this.showToast(this.t('share.toastLinkCopied'));
      });
    });

    // Copy social forward text
    document.getElementById('btn-copy-forward-text')?.addEventListener('click', () => {
      const forwardText = this.t('share.forwardTemplate', { url: playUrl });
      navigator.clipboard.writeText(forwardText).then(() => {
        this.showToast(this.t('share.toastTextCopied'));
      });
    });

    // Generate & Download Poster Image Canvas
    document.getElementById('btn-download-poster')?.addEventListener('click', () => {
      this.generateAndDownloadPoster(shareCode, playUrl);
    });
  }

  generateAndDownloadPoster(shareCode, playUrl) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 840;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 840);
    grad.addColorStop(0, '#FFE066');
    grad.addColorStop(0.5, '#FF85A2');
    grad.addColorStop(1, '#70D6FF');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 840);

    // Outer card border
    ctx.fillStyle = '#FFFFFF';
    ctx.roundRect(30, 30, 540, 780, 32);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2D3748';
    ctx.stroke();

    // Title & Header
    ctx.fillStyle = '#FF5376';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐣 蛋仔闯关邀请函 💌', 300, 110);

    ctx.fillStyle = '#2D3748';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('快来挑战我的蛋仔专属问卷赛道！', 300, 165);

    // Decorative Egg Illustration
    ctx.font = '72px sans-serif';
    ctx.fillText('🐣✨', 300, 260);

    // Draw QR code image
    const qrImg = document.getElementById('share-qr-image');
    if (qrImg && qrImg.src) {
      const imgObj = new Image();
      imgObj.crossOrigin = 'anonymous';
      imgObj.onload = () => {
        ctx.drawImage(imgObj, 175, 310, 250, 250);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#2D3748';
        ctx.strokeRect(175, 310, 250, 250);

        ctx.fillStyle = '#2D3748';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`闯关码：${shareCode}`, 300, 605);

        ctx.fillStyle = '#718096';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('手机扫描二维码 · 网页端点击即玩', 300, 650);
        ctx.fillText('一个问题一个关卡 · 奔跑跳跃赢取派对奖杯！', 300, 690);

        // Download
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `蛋仔问卷闯关邀请卡_${shareCode}.png`;
        a.click();
        this.showToast('海报已生成并开始下载！');
      };
      imgObj.src = qrImg.src;
    }
  }

  // ================= AUTH MODAL (注册与登录) =================
  openAuthModal(onSuccess) {
    let modalEl = document.getElementById('auth-modal-container');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'auth-modal-container';
      document.body.appendChild(modalEl);
    }

    let isRegisterMode = false;

    const render = () => {
      modalEl.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-dialog">
            <button class="modal-close-btn" id="btn-close-auth-modal">✕</button>
            <div style="text-align:center; margin-bottom:18px;">
              <div style="font-size:42px; margin-bottom:6px;">🐣</div>
              <h2 style="font-size:22px; font-weight:900; color:#1A202C;">
                ${this.t(isRegisterMode ? 'auth.registerTitle' : 'auth.loginTitle')}
              </h2>
              <p style="font-size:13px; color:#718096; font-weight:600;">
                ${this.t(isRegisterMode ? 'auth.registerDesc' : 'auth.loginDesc')}
              </p>
            </div>

            <form id="auth-form">
              <div class="editor-form-group">
                <label class="editor-label">${this.t('auth.username')}</label>
                <input type="text" id="auth-username" class="editor-input" placeholder="${this.t('auth.usernamePlaceholder')}" required>
              </div>

              <div class="editor-form-group">
                <label class="editor-label">${this.t('auth.password')}</label>
                <input type="password" id="auth-password" class="editor-input" placeholder="${this.t('auth.passwordPlaceholder')}" required>
              </div>

              ${isRegisterMode ? `
                <div class="editor-form-group">
                  <label class="editor-label">${this.t('auth.nickname')}</label>
                  <input type="text" id="auth-nickname" class="editor-input" placeholder="${this.t('auth.nicknamePlaceholder')}">
                </div>
              ` : ''}

              <button type="submit" class="egg-btn egg-btn-primary" style="width:100%; margin-top:10px;">
                ${this.t(isRegisterMode ? 'auth.btnSubmitRegister' : 'auth.btnSubmitLogin')}
              </button>
            </form>

            <div style="text-align:center; margin-top:16px; font-size:14px; font-weight:700;">
              ${isRegisterMode ? `
                <a href="javascript:void(0)" id="btn-switch-auth" style="color:#FF5376;">${this.t('auth.switchToLogin')}</a>
              ` : `
                <a href="javascript:void(0)" id="btn-switch-auth" style="color:#FF5376;">${this.t('auth.switchToRegister')}</a>
              `}
            </div>

            <div style="margin-top:14px; padding:10px; background:#F7FAFC; border-radius:12px; font-size:12px; color:#718096; text-align:center;">
              ${this.t('auth.adminHint')}
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-close-auth-modal')?.addEventListener('click', () => {
        modalEl.innerHTML = '';
      });

      document.getElementById('btn-switch-auth')?.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        render();
      });

      document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();

        try {
          if (isRegisterMode) {
            const nickname = document.getElementById('auth-nickname')?.value.trim();
            const res = await window.api.register({ username, password, nickname });
            this.currentUser = res.user;
            this.showToast(this.t('auth.registerSuccess'));
          } else {
            const res = await window.api.login({ username, password });
            this.currentUser = res.user;
            this.showToast(this.t('auth.loginSuccess', { name: this.currentUser.nickname || this.currentUser.username }));
          }

          modalEl.innerHTML = '';
          this.renderHeader();
          if (onSuccess) onSuccess();
          else this.loadSurveysList();
        } catch (err) {
          this.showToast(err.message);
        }
      });
    };

    render();
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }
}

// Instantiate global app
window.app = new App();
