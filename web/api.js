// Клиент REST API платформы. Токен доступа хранится в памяти + localStorage,
// refresh-токен обновляет сессию при истечении.
const TOKEN_KEY = "cp_access_token";
const REFRESH_KEY = "cp_refresh_token";

const api = {
  get accessToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  },
  set accessToken(v) {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  },
  get refreshToken() {
    return localStorage.getItem(REFRESH_KEY) || "";
  },
  set refreshToken(v) {
    if (v) localStorage.setItem(REFRESH_KEY, v);
    else localStorage.removeItem(REFRESH_KEY);
  },

  async request(method, path, body, retry = true) {
    const res = await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry && this.refreshToken && !path.includes("/auth/")) {
      const ok = await this.tryRefresh();
      if (ok) return this.request(method, path, body, false);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const message = (data && data.error) || `Ошибка ${res.status}`;
      throw new Error(message);
    }
    return data;
  },

  async tryRefresh() {
    try {
      const data = await this.request("POST", "/api/auth/refresh", { refreshToken: this.refreshToken }, false);
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      return true;
    } catch {
      this.accessToken = "";
      this.refreshToken = "";
      return false;
    }
  },

  async login(email, password) {
    const data = await this.request("POST", "/api/auth/login", { email, password }, false);
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    return data.user;
  },

  async logout() {
    try {
      if (this.refreshToken) await this.request("POST", "/api/auth/logout", { refreshToken: this.refreshToken }, false);
    } catch {
      /* ignore */
    }
    this.accessToken = "";
    this.refreshToken = "";
  },

  getState() {
    return this.request("GET", "/api/state");
  },
};
