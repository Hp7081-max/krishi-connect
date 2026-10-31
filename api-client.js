/**
 * Krishi Connect (Kisaan Setu) - API Client
 * Seamless connection between Frontend and Express/MongoDB Backend
 */
(function() {
  const DEFAULT_BACKEND = 'http://localhost:5000';
  const BASE_URL = (window.location.protocol.startsWith('http') && window.location.port !== '5500')
    ? window.location.origin
    : DEFAULT_BACKEND;

  let socket = null;
  let token = localStorage.getItem('krishi_token') || null;

  async function apiFetch(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    let userRole = '';
    try {
      const u = JSON.parse(sessionStorage.getItem('kc_user') || localStorage.getItem('kc_logged_user') || '{}');
      userRole = u.role || '';
    } catch(e){}

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(userRole ? { 'x-user-role': userRole } : {}),
      ...(options.headers || {})
    };

    try {
      const res = await fetch(url, {
        ...options,
        headers
      });
      const data = await res.json();
      if (res.status === 401 && token && !endpoint.startsWith('/api/auth/')) {
        // Token expired or invalid: forget it so the user logs in again
        token = null;
        localStorage.removeItem('krishi_token');
      }
      if (!res.ok) {
        throw new Error(data.message || `API error (${res.status})`);
      }
      return data;
    } catch (err) {
      console.warn(`[KrishiAPI] Request failed for ${endpoint}:`, err.message);
      throw err;
    }
  }

  const KrishiAPI = {
    isOnline: false,
    baseUrl: BASE_URL,

    async init() {
      try {
        console.log(`[KrishiAPI] Probing backend at ${BASE_URL}/api/health...`);
        const res = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
        if (res.ok) {
          const health = await res.json();
          this.isOnline = true;
          console.log('✅ [KrishiAPI] Backend connected successfully!', health);
          return true;
        }
      } catch (e) {
        console.warn('⚠️ [KrishiAPI] Backend not reachable at', BASE_URL, '- running in offline localStorage mode.');
      }
      this.isOnline = false;
      return false;
    },

    async register(userData) {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      if (res.token) {
        token = res.token;
        localStorage.setItem('krishi_token', token);
      }
      return res;
    },

    async sendOtp(email, purpose) {
      return await apiFetch('/api/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ email, purpose })
      });
    },

    async resetPassword(email, otp, newPassword) {
      return await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, otp, newPassword })
      });
    },

    async login(contact, password, otp) {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ contact, password, otp })
      });
      if (res.token) {
        token = res.token;
        localStorage.setItem('krishi_token', token);
      }
      return res;
    },

    async updateProfile(profileData) {
      return await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData)
      });
    },

    async syncToState(S, toastFn) {
      if (!this.isOnline || !S) return false;
      try {
        const res = await apiFetch('/api/state/sync');
        if (res && res.success && res.data) {
          const remote = res.data;
          if (Array.isArray(remote.listings) && remote.listings.length) {
            S.listings = remote.listings;
          }
          if (Array.isArray(remote.bids)) {
            S.bids = remote.bids;
          }
          if (Array.isArray(remote.deals)) {
            S.deals = remote.deals;
          }
          if (Array.isArray(remote.returns)) {
            S.returns = remote.returns;
          }
          if (Array.isArray(remote.equipment) && remote.equipment.length) {
            S.equipment = remote.equipment;
          }
          if (remote.wallet && typeof remote.wallet.balance === 'number') {
            S.wallet = remote.wallet;
          }
          if (remote.prices) {
            S.prices = remote.prices;
          }

          if (typeof toastFn === 'function') {
            toastFn(`⚡ Connected to Backend (${res.db ? res.db.mode : 'online'})`);
          }
          return true;
        }
      } catch (err) {
        console.warn('[KrishiAPI] syncToState failed:', err.message);
      }
      return false;
    },

    startLiveSync(S, renderFn, toastFn) {
      if (!this.isOnline) return;

      // Always maintain rapid polling for instant cross-device updates (phone/desktop)
      this._startPollingSync(S, renderFn);

      // Dynamically load Socket.IO client script if not already present
      if (typeof io === 'undefined') {
        const script = document.createElement('script');
        script.src = `${BASE_URL}/socket.io/socket.io.js`;
        script.onload = () => {
          this._initSocket(S, renderFn, toastFn);
        };
        script.onerror = () => {
          console.log('[KrishiAPI] Socket.IO script failed to load, rapid background polling active');
        };
        document.head.appendChild(script);
      } else {
        this._initSocket(S, renderFn, toastFn);
      }
    },

    _initSocket(S, renderFn, toastFn) {
      try {
        if (typeof io !== 'function') return;
        socket = io(BASE_URL);

        socket.on('connect', () => {
          console.log('⚡ [KrishiAPI] Realtime WebSocket connected:', socket.id);
        });

        socket.on('listing:created', (newLot) => {
          if (!S.listings.some(l => l.id === newLot.id)) {
            S.listings.unshift(newLot);
            if (typeof renderFn === 'function') renderFn();
            if (typeof toastFn === 'function') {
              toastFn(`🔔 New crop listed: ${newLot.cropKey} (${newLot.qty} qtl)`);
            }
          }
        });

        socket.on('bid:created', (newBid) => {
          const exists = S.bids.some(b => b.id === newBid.id || (b.listingId === newBid.listingId && b.rate === newBid.rate && b.qty === newBid.qty && Math.abs(b.created - newBid.created) < 3000));
          if (!exists) {
            const myName = (S.me && S.me.name ? S.me.name : "").trim().toLowerCase();
            const bName = (newBid.buyer || "").trim().toLowerCase();
            newBid.mine = !!(myName && bName && (bName === myName || bName.includes(myName)));
            S.bids.unshift(newBid);
            if (typeof window.save === 'function') window.save();
            if (typeof renderFn === 'function') renderFn();
            if (typeof toastFn === 'function') {
              if (S.role === 'farmer') {
                toastFn(`💰 नई बोली आई: ₹${newBid.rate}/क्विंटल (${newBid.buyer})`);
              } else {
                toastFn(`💰 New bid: ₹${newBid.rate}/qtl from ${newBid.buyer}`);
              }
            }
          }
        });

        socket.on('bid:accepted', (data) => {
          const b = S.bids.find(x => x.id === data.bidId || x.listingId === data.listingId);
          if (b) b.status = 'accepted';
          const l = S.listings.find(x => x.id === data.listingId);
          if (l) l.status = 'sold';
          if (typeof window.save === 'function') window.save();
          if (typeof renderFn === 'function') renderFn();
          if (typeof toastFn === 'function') {
            const myName = (S.me && S.me.name ? S.me.name : "").trim().toLowerCase();
            const bName = (data.buyer || "").trim().toLowerCase();
            const isMe = !myName || !bName || bName === myName || bName.includes(myName) || S.role === 'buyer';
            if (isMe) {
              toastFn(`🎉 किसान ${data.farmer || 'साथी'} ने आपकी बोली स्वीकार कर ली है! (₹${data.rate}/क्विंटल)`);
            }
          }
        });

        socket.on('deal:created', ({ deal, contract }) => {
          if (!S.deals.some(d => d.id === deal.id)) {
            S.deals.unshift(deal);
            if (contract && Array.isArray(S.contracts)) S.contracts.unshift(contract);
            const b = S.bids.find(x => x.listingId === deal.listingId && (x.buyer === deal.buyer || x.mine));
            if (b) b.status = 'accepted';
            const l = S.listings.find(x => x.id === deal.listingId);
            if (l) l.status = 'sold';
            if (typeof window.save === 'function') window.save();
            if (typeof renderFn === 'function') renderFn();
            if (typeof toastFn === 'function') {
              const myName = (S.me && S.me.name ? S.me.name : "").trim().toLowerCase();
              const bName = (deal.buyer || "").trim().toLowerCase();
              const isMe = !myName || !bName || bName === myName || bName.includes(myName) || S.role === 'buyer';
              if (isMe) {
                toastFn(`🎉 किसान ${deal.farmer || 'साथी'} ने आपकी बोली स्वीकार कर ली है! (सौदा #${deal.id} · ₹${deal.rate}/क्विंटल)`);
              }
            }
          }
        });

        socket.on('bid:updated', (data) => {
          const b = S.bids.find(x => x.id === data.id);
          if (b) {
            b.status = data.status;
            if (data.counterRate) b.counterRate = data.counterRate;
            if (typeof window.save === 'function') window.save();
            if (typeof renderFn === 'function') renderFn();
          }
        });

        socket.on('deal:stage', (data) => {
          const d = S.deals.find(x => x.id === data.dealId);
          if (d) {
            d.stage = data.stage;
            if (data.escrow) d.escrow = data.escrow;
            if (typeof window.save === 'function') window.save();
            if (typeof renderFn === 'function') renderFn();
          }
        });

        socket.on('equipment:booked', (data) => {
          const eq = S.equipment.find(e => e.id === data.id);
          if (eq) {
            eq.available = false;
            if (typeof window.save === 'function') window.save();
            if (typeof renderFn === 'function') renderFn();
          }
        });

        socket.on('return:created', (newRet) => {
          if (!S.returns) S.returns = [];
          if (!S.returns.some(r => r.id === newRet.id)) {
            S.returns.unshift(newRet);
            if (typeof window.save === 'function') window.save();
            if (typeof renderFn === 'function') renderFn();
            if (typeof toastFn === 'function') {
              const myName = (S.me && S.me.name ? S.me.name : "").trim().toLowerCase();
              const fName = (newRet.farmer || "").trim().toLowerCase();
              const bName = (newRet.buyer || "").trim().toLowerCase();
              if (myName && fName && (fName.includes(myName) || myName.includes(fName))) {
                toastFn(`⚠️ वापसी अर्जी: सौदे #${newRet.dealId} पर खरीदार ने शिकायत दर्ज की`);
              } else if (myName && bName && (bName.includes(myName) || myName.includes(bName))) {
                toastFn(`📋 आपकी वापसी अर्जी #${newRet.id} सफलता से दर्ज हो गई`);
              } else if (S.role === 'admin') {
                toastFn(`🛡️ नई वापसी अर्जी दर्ज: #${newRet.id} (${newRet.cropName})`);
              }
            }
          }
        });

        socket.on('return:updated', (updatedRet) => {
          if (!S.returns) S.returns = [];
          const idx = S.returns.findIndex(r => r.id === updatedRet.id);
          if (idx >= 0) {
            S.returns[idx] = updatedRet;
          } else {
            S.returns.unshift(updatedRet);
          }
          if (typeof window.save === 'function') window.save();
          if (typeof renderFn === 'function') renderFn();
          if (typeof toastFn === 'function') {
            toastFn(`🔄 वापसी #${updatedRet.id} स्टेटस अपडेट: ${updatedRet.status}`);
          }
        });

        socket.on('return:resolved', (data) => {
          if (typeof toastFn === 'function') {
            toastFn(`💰 वापसी #${data.returnId} का फैसला हुआ (${data.status})`);
          }
        });

      } catch (err) {
        console.warn('[KrishiAPI] Socket initialization failed:', err);
      }
    },

    _startPollingSync(S, renderFn) {
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = setInterval(async () => {
        if (!token) return; // not logged in yet: nothing to fetch
        try {
          const res = await apiFetch('/api/state/sync');
          if (res && res.success && res.data) {
            let updated = false;
            if (Array.isArray(res.data.bids)) {
              if (res.data.bids.length !== S.bids.length || JSON.stringify(res.data.bids.map(b=>b.id+b.status)) !== JSON.stringify(S.bids.map(b=>b.id+b.status))) {
                const myName = (S.me && S.me.name ? S.me.name : "").trim().toLowerCase();
                S.bids = res.data.bids.map(b => {
                  const bName = (b.buyer || "").trim().toLowerCase();
                  return {
                    ...b,
                    mine: !!(myName && bName && (bName === myName || bName.includes(myName)))
                  };
                });
                updated = true;
              }
            }
            if (Array.isArray(res.data.listings) && res.data.listings.length !== S.listings.length) {
              S.listings = res.data.listings;
              updated = true;
            }
            if (Array.isArray(res.data.deals) && res.data.deals.length !== S.deals.length) {
              S.deals = res.data.deals;
              updated = true;
            }
            if (Array.isArray(res.data.returns)) {
              if (!S.returns || res.data.returns.length !== S.returns.length || JSON.stringify(res.data.returns.map(r=>r.id+r.status)) !== JSON.stringify((S.returns||[]).map(r=>r.id+r.status))) {
                S.returns = res.data.returns;
                updated = true;
              }
            }
            if (updated) {
              if (typeof window.save === 'function') window.save();
              if (typeof renderFn === 'function') renderFn();
            }
          }
        } catch (e) {}
      }, 2500);
    },

    // Marketplace Actions
    async createListing(lotData) {
      return await apiFetch('/api/listings', {
        method: 'POST',
        body: JSON.stringify(lotData)
      });
    },

    async createBid(bidData) {
      return await apiFetch('/api/bids', {
        method: 'POST',
        body: JSON.stringify(bidData)
      });
    },

    async acceptBid(bidId) {
      return await apiFetch(`/api/bids/${bidId}/accept`, { method: 'POST' });
    },

    async rejectBid(bidId) {
      return await apiFetch(`/api/bids/${bidId}/reject`, { method: 'POST' });
    },

    async counterBid(bidId, counterRate) {
      return await apiFetch(`/api/bids/${bidId}/counter`, {
        method: 'POST',
        body: JSON.stringify({ counterRate })
      });
    },

    async acceptCounter(bidId) {
      return await apiFetch(`/api/bids/${bidId}/accept-counter`, { method: 'POST' });
    },

    async advanceDeal(dealId) {
      return await apiFetch(`/api/deals/${dealId}/advance`, { method: 'POST' });
    },

    async assignDriver(dealId, transporter) {
      return await apiFetch(`/api/deals/${dealId}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ transporter })
      });
    },

    async releaseEscrow(dealId) {
      return await apiFetch(`/api/deals/${dealId}/release-escrow`, { method: 'POST' });
    },

    async bookQC(dealId, quality) {
      return await apiFetch(`/api/deals/${dealId}/book-qc`, {
        method: 'POST',
        body: JSON.stringify({ quality })
      });
    },

    async bookEquipment(equipId) {
      return await apiFetch(`/api/equipment/${equipId}/book`, { method: 'POST' });
    },

    async addEquipment(newEq) {
      return await apiFetch('/api/equipment', {
        method: 'POST',
        body: JSON.stringify(newEq)
      });
    },

    async withdraw() {
      return await apiFetch('/api/wallet/withdraw', { method: 'POST' });
    },

    async scanDisease(cropKey, photoUrl, lang) {
      return await apiFetch('/api/tools/scan-disease', {
        method: 'POST',
        body: JSON.stringify({ cropKey, photoUrl, lang })
      });
    },

    async getSoilAdvisory(n, p, k, lang) {
      return await apiFetch('/api/tools/soil-advisory', {
        method: 'POST',
        body: JSON.stringify({ n, p, k, lang })
      });
    },

    // Return & Refund System
    async getReturns(query = {}) {
      const q = new URLSearchParams(query).toString();
      return await apiFetch(`/api/returns${q ? '?' + q : ''}`);
    },

    async createReturn(returnData) {
      return await apiFetch('/api/returns', {
        method: 'POST',
        body: JSON.stringify(returnData)
      });
    },

    async farmerRespondReturn(returnId, farmerName, payload) {
      return await apiFetch(`/api/returns/${returnId}/farmer-response`, {
        method: 'POST',
        body: JSON.stringify({ farmerName, ...payload })
      });
    },

    async adminResolveReturn(returnId, adminName, payload) {
      return await apiFetch(`/api/returns/${returnId}/admin-decision`, {
        method: 'POST',
        body: JSON.stringify({ adminName, ...payload })
      });
    },

    async requestMoreEvidence(returnId, adminName, payload) {
      return await apiFetch(`/api/returns/${returnId}/evidence-request`, {
        method: 'POST',
        body: JSON.stringify({ adminName, ...payload })
      });
    },

    async submitAdditionalEvidence(returnId, userName, userRole, payload) {
      return await apiFetch(`/api/returns/${returnId}/evidence-submit`, {
        method: 'POST',
        body: JSON.stringify({ userName, userRole, ...payload })
      });
    },

    async updateReturnShipment(returnId, payload) {
      return await apiFetch(`/api/returns/${returnId}/shipment`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  };

  window.KrishiAPI = KrishiAPI;
})();
