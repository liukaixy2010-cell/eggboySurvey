/**
 * API Client for "蛋仔问卷" (Eggboy Survey)
 */
class ApiClient {
  constructor() {
    this.baseUrl = '';
  }

  getToken() {
    return localStorage.getItem('eggboy_token');
  }

  setToken(token) {
    if (token) {
      localStorage.setItem('eggboy_token', token);
    } else {
      localStorage.removeItem('eggboy_token');
    }
  }

  getUser() {
    try {
      const u = localStorage.getItem('eggboy_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  setUser(user) {
    if (user) {
      localStorage.setItem('eggboy_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('eggboy_user');
    }
  }

  clearAuth() {
    this.setToken(null);
    this.setUser(null);
  }

  async request(endpoint, options = {}) {
    const url = this.baseUrl + endpoint;
    const headers = options.headers || {};
    
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const res = await fetch(url, config);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '请求失败，请稍后重试');
      }
      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  }

  // --- Auth ---
  async register(data) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.token) {
      this.setToken(res.token);
      this.setUser(res.user);
    }
    return res;
  }

  async login(data) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.token) {
      this.setToken(res.token);
      this.setUser(res.user);
    }
    return res;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // --- Surveys ---
  async getSurveys() {
    return this.request('/api/surveys');
  }

  async getSurvey(id) {
    return this.request(`/api/surveys/${id}`);
  }

  async createSurvey(data) {
    return this.request('/api/surveys', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateSurvey(id, data) {
    return this.request(`/api/surveys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteSurvey(id) {
    return this.request(`/api/surveys/${id}`, {
      method: 'DELETE'
    });
  }

  async togglePublishSurvey(id) {
    return this.request(`/api/surveys/${id}/publish`, {
      method: 'POST'
    });
  }

  // --- Results ---
  async getSurveyResults(id) {
    return this.request(`/api/surveys/${id}/results`);
  }

  async deleteResponse(surveyId, responseId) {
    return this.request(`/api/surveys/${surveyId}/responses/${responseId}`, {
      method: 'DELETE'
    });
  }

  // --- Public Play ---
  async getRecentSurveys(limit = 10) {
    return this.request(`/api/public/recent-surveys?limit=${limit}`);
  }

  async getPublicSurvey(code) {
    return this.request(`/api/play/${code}`);
  }

  async submitGameResponse(code, data) {
    return this.request(`/api/play/${code}/submit`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getQrCode(code) {
    return this.request(`/api/play/${code}/qrcode`);
  }

  // --- Audio Upload ---
  async uploadAudio(base64Data, ext = 'webm') {
    return this.request('/api/upload-audio', {
      method: 'POST',
      body: JSON.stringify({ audioData: base64Data, ext })
    });
  }

  // --- Admin Management ---
  async getAdminOverview() {
    return this.request('/api/admin/overview');
  }

  async getAdminUsers() {
    return this.request('/api/admin/users');
  }

  async createAdminUser(data) {
    return this.request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminUser(id, data) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteAdminUser(id) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'DELETE'
    });
  }

  async getAdminSurveys() {
    return this.request('/api/admin/surveys');
  }

  async deleteAdminSurvey(id) {
    return this.request(`/api/admin/surveys/${id}`, {
      method: 'DELETE'
    });
  }

  async togglePublishAdminSurvey(id) {
    return this.request(`/api/admin/surveys/${id}/publish`, {
      method: 'POST'
    });
  }
}

window.api = new ApiClient();
