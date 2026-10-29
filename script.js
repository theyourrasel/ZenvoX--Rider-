// ==========================================
// ZENVO COMPLETE SUPER APP SCRIPT (ALL MODULES)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  if (typeof L === 'undefined') {
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
    window.L = { map: () => noop, tileLayer: () => noop, marker: () => noop, circle: () => noop, divIcon: () => ({}) };
    window.__mapMissing = true;
  }
  // Paste your own Firebase keys below to switch on live cloud sync
  const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "zenvo-biker.firebaseapp.com",
    databaseURL: "https://zenvo-biker-default-rtdb.firebaseio.com",
    projectId: "zenvo-biker",
  };

  let db = null;
  let isFirebaseConnected = false;

  try {
    if (firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY" && typeof firebase !== 'undefined') {
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      isFirebaseConnected = true;
      document.getElementById('db-connection-status').textContent = '● Firebase Cloud Live';
    } else {
      document.getElementById('db-connection-status').textContent = '● Local Cloud Sim Active';
    }
  } catch (err) {
    console.warn('Running in local fallback mode:', err);
  }

  let userLat = 26.0330;
  let userLng = 88.4617;
  let riderName = localStorage.getItem('zenvo_rider_name') || 'MD. Rasel Islam';
  let activeSquadCode = localStorage.getItem('zenvo_squad_code') || '';
  let creatorEarnings = parseFloat(localStorage.getItem('zenvo_earnings') || '14.85');
  let rideEarningsBdt = parseInt(localStorage.getItem('zenvo_ride_bdt') || '450', 10);
  let odometerKm = parseInt(localStorage.getItem('zenvo_odom_km') || '14320', 10);
  let nextOilKm = parseInt(localStorage.getItem('zenvo_next_oil') || '15000', 10);
  let currentLang = 'EN';
  let isMeshActive = false;
  let userMarker = null;
  let sirenInterval = null;
  let oilHealth = parseInt(localStorage.getItem('zenvo_oil_health') || '82', 10);

  // Escape user-entered text before putting it into innerHTML
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Read a chosen photo file as a data URL (falls back to a default image)
  const readImage = (inputId, fallback) => new Promise((resolve) => {
    const file = document.getElementById(inputId).files[0];
    if (!file) return resolve(fallback);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(fallback);
    reader.readAsDataURL(file);
  });

  // General (non-legal-advice) answers for the Traffic Law chat
  function lawReply(q) {
    const t = q.toLowerCase();
    const note = ' (General information, not legal advice. Confirm with BRTA or a lawyer.)';
    if (t.includes('key')) return "🔑 If you are stopped, stay calm and polite and show your valid documents. Ask for the officer's name/ID and a written receipt for anything taken. Police powers are defined in the Road Transport Act 2018." + note;
    if (t.includes('license') || t.includes('licence')) return '🪪 Riding without a valid driving license is an offence under the Road Transport Act 2018. Fine amounts can change, so check the latest figure with BRTA. Keep your smart card or a digital copy in the Doc Vault.' + note;
    if (t.includes('helmet') || t.includes('pillion')) return '🪖 Wear a certified helmet with the chin strap fastened. Helmet rules are enforced for riders, and for pillion riders too.' + note;
    if (t.includes('exhaust') || t.includes('silencer')) return '🔊 Modified or extra-loud exhausts can be treated as a violation of vehicle-fitness and noise rules. Keep the stock or a certified silencer.' + note;
    return '⚖️ Always carry your license, registration and tax token, wear a helmet and follow signals. Ask me about license, helmet, exhaust or police stops.' + note;
  }

  const hazards = [
    {
      id: 'z1',
      type: 'POLICE',
      title: 'Police Checkpost Ahead',
      lat: 26.0365,
      lng: 88.4640,
      time: '2 mins ago',
      reporter: 'Zenvo_Sakib',
      squadCode: '',
    },
    {
      id: 'z2',
      type: 'HAZARD',
      title: 'Deep Pothole / Road Work',
      lat: 26.0295,
      lng: 88.4590,
      time: '10 mins ago',
      reporter: 'MD. Rasel Islam',
      squadCode: '',
    },
  ];

  function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  const map = L.map('zenvo-map', { zoomControl: false }).setView([userLat, userLng], 14);

  function setMapNotice(msg) {
    let el = document.getElementById('map-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'map-notice';
      el.className = 'map-notice';
      document.getElementById('tab-radar').appendChild(el);
    }
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  // CARTO now needs a free key (get one at https://carto.com/basemaps/apikey/). Paste it here for the original dark map.
  // Leave it empty to use the free OpenStreetMap tiles in dark mode instead (no key needed).
  const CARTO_KEY = '';
  const TILE_SOURCES = [
    ...(CARTO_KEY ? [{ url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_KEY}`, subdomains: '', dark: false }] : []),
    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc', dark: true },
    { url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', subdomains: 'abc', dark: true },
  ];
  let tileIdx = -1;
  let tileLayerNow = null;
  let tileOk = false;
  let tileErr = 0;

  function useTiles(i) {
    if (window.__mapMissing) return setMapNotice('⚠️ Map library failed to load. Check your internet connection and reload.');
    if (i >= TILE_SOURCES.length) return setMapNotice('⚠️ Map tiles could not load. Check internet, and open the app over https (not a local file).');
    if (tileLayerNow) map.removeLayer(tileLayerNow);
    tileIdx = i;
    tileOk = false;
    tileErr = 0;
    const s = TILE_SOURCES[i];
    map.getContainer().classList.toggle('osm-dark', s.dark);
    tileLayerNow = L.tileLayer(s.url, { subdomains: s.subdomains, maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    tileLayerNow.on('tileload', () => { tileOk = true; setMapNotice(''); });
    tileLayerNow.on('tileerror', () => { tileErr += 1; if (!tileOk && tileErr >= 4 && tileIdx === i) useTiles(i + 1); });
    tileLayerNow.addTo(map);
    setTimeout(() => { if (!tileOk && tileIdx === i) useTiles(i + 1); }, 7000);
  }
  useTiles(0);

  // Leaflet needs a size refresh when the layout settles or the screen rotates
  window.addEventListener('load', () => map.invalidateSize());
  ['resize', 'orientationchange'].forEach((ev) => window.addEventListener(ev, () => setTimeout(() => map.invalidateSize(), 200)));
  setTimeout(() => map.invalidateSize(), 300);
  setTimeout(() => map.invalidateSize(), 1200);

  function createHazardIcon(type) {
    let iconClass = 'ri-error-warning-fill';
    let bgClass = 'pin-hazard';
    if (type === 'POLICE') {
      iconClass = 'ri-police-car-fill';
      bgClass = 'pin-police';
    } else if (type === 'ACCIDENT') {
      iconClass = 'ri-first-aid-kit-fill';
      bgClass = 'pin-sos';
    } else if (type === 'PICKUP') {
      iconClass = 'ri-map-pin-user-fill';
      bgClass = 'pin-pickup';
    } else if (type === 'GARAGE') {
      iconClass = 'ri-tools-fill';
      bgClass = 'pin-garage';
    } else if (type === 'STOLEN') {
      iconClass = 'ri-motorbike-fill';
      bgClass = 'pin-stolen';
    }
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="zenvo-marker-pin ${bgClass}"><i class="${iconClass}"></i></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }

  function addHazardToMap(item) {
    const distKm = getDistanceInKm(userLat, userLng, item.lat, item.lng).toFixed(2);
    const marker = L.marker([item.lat, item.lng], { icon: createHazardIcon(item.type) }).addTo(map);
    const squadBadge = item.squadCode ? `<br><span style="color:#00E676;">[Squad: ${esc(item.squadCode)}]</span>` : '';
    marker.bindPopup(`<b>${esc(item.title)}</b> (${distKm} KM)<br><small>By ${esc(item.reporter)} • ${esc(item.time)}</small>${squadBadge}`);

    const isPolice = item.type === 'POLICE';
    L.circle([item.lat, item.lng], {
      color: isPolice ? '#FF2A4B' : '#FF9F1C',
      fillColor: isPolice ? '#FF2A4B' : '#FF9F1C',
      fillOpacity: 0.18,
      weight: 1.5,
      radius: 450,
    }).addTo(map);
  }

  hazards.forEach((h) => addHazardToMap(h));

  function updateRadarBanner() {
    const nearbyCount = hazards.filter((h) => getDistanceInKm(userLat, userLng, h.lat, h.lng) <= 2.5).length;
    document.getElementById('radar-banner-text').textContent = `RADAR: ${nearbyCount} Alerts within 2KM`;
  }

  const riderIcon = L.divIcon({
    className: 'rider-div-icon',
    html: `<div class="pin-rider"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  userMarker = L.marker([userLat, userLng], { icon: riderIcon }).addTo(map).bindPopup(`<b>${esc(riderName)} (You)</b>`);

  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        userMarker.setLatLng([userLat, userLng]);
        const speedKmh = pos.coords.speed ? Math.max(0, Math.round(pos.coords.speed * 3.6)) : 0;
        document.getElementById('speed-value').textContent = speedKmh;
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  }

  document.getElementById('btn-recenter-gps').addEventListener('click', () => {
    map.flyTo([userLat, userLng], 15, { duration: 0.8 });
  });

  function jumpToMapAndPin(lat, lng, type, title, subtitle) {
    document.querySelectorAll('.tab-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-screen').forEach((s) => s.classList.remove('active'));
    document.querySelector('[data-target="tab-radar"]').classList.add('active');
    document.getElementById('tab-radar').classList.add('active');

    setTimeout(() => {
      map.invalidateSize();
      const pinMarker = L.marker([lat, lng], { icon: createHazardIcon(type) }).addTo(map);
      pinMarker.bindPopup(`<b>${esc(title)}</b><br><small>${esc(subtitle)}</small>`).openPopup();
      if (type === 'STOLEN') {
        L.circle([lat, lng], { color: '#FF0055', fillColor: '#FF0055', fillOpacity: 0.2, radius: 600 }).addTo(map);
      }
      map.flyTo([lat, lng], 15, { duration: 0.9 });
    }, 120);
  }

  function playSingleSirenPulse() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(920, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch (e) {}
  }

  function triggerFullSirenOverlay(alertItem, distanceKm) {
    document.getElementById('siren-badge-tag').textContent = alertItem.squadCode
      ? `⚡ SQUAD PRIORITY ALERT (${alertItem.squadCode})`
      : 'PUBLIC 2KM RADAR ALERT';
    document.getElementById('siren-alert-title').textContent = `${alertItem.title.toUpperCase()}!`;
    document.getElementById('siren-distance-text').textContent = `${distanceKm.toFixed(2)} KM AHEAD OF YOU`;
    document.getElementById('siren-reporter-text').textContent = `Reported by ${alertItem.reporter} • Just now`;
    document.getElementById('siren-danger-overlay').classList.remove('hidden');

    if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
    playSingleSirenPulse();
    if (sirenInterval) clearInterval(sirenInterval);
    sirenInterval = setInterval(playSingleSirenPulse, 850);
  }

  document.getElementById('btn-mute-siren').addEventListener('click', () => {
    document.getElementById('siren-danger-overlay').classList.add('hidden');
    if (sirenInterval) clearInterval(sirenInterval);
  });

  function showZenvoModal(title, message) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('zenvo-modal').classList.remove('hidden');
  }

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('zenvo-modal').classList.add('hidden');
  });

  function broadcastZenvoAlert(type, label) {
    if (navigator.vibrate) navigator.vibrate(200);
    playSingleSirenPulse();
    const newAlert = {
      id: 'z_' + Date.now(),
      type,
      title: label,
      lat: userLat,
      lng: userLng,
      time: 'Just now',
      reporter: riderName,
      squadCode: activeSquadCode || '',
    };
    hazards.unshift(newAlert);
    if (isFirebaseConnected) db.ref('zenvo_hazards/' + newAlert.id).set({ ...newAlert, ts: Date.now() });
    addHazardToMap(newAlert);
    updateRadarBanner();
    map.panTo([userLat, userLng]);
    showZenvoModal(`🚨 ${label.toUpperCase()} SENT!`, `Broadcasted to all Zenvo riders within 2KM!`);
  }

  document.getElementById('btn-alert-police').addEventListener('click', () => broadcastZenvoAlert('POLICE', 'Police Checkpost'));
  document.getElementById('btn-alert-hazard').addEventListener('click', () => broadcastZenvoAlert('HAZARD', 'Roadblock / Pothole'));
  document.getElementById('btn-alert-sos').addEventListener('click', () => broadcastZenvoAlert('ACCIDENT', 'Emergency Crash SOS'));

  document.getElementById('btn-simulate-incoming').addEventListener('click', () => {
    const sim = {
      id: 'sim_' + Date.now(),
      type: 'POLICE',
      title: 'Police Checkpost Ahead',
      lat: userLat + 0.0052,
      lng: userLng + 0.0015,
      time: 'Just now',
      reporter: activeSquadCode ? 'Squad_Leader_Sakib' : 'Rider_Tanvir',
      squadCode: activeSquadCode || '',
    };
    hazards.unshift(sim);
    addHazardToMap(sim);
    updateRadarBanner();
    map.flyTo([sim.lat, sim.lng], 15, { duration: 0.8 });
    triggerFullSirenOverlay(sim, getDistanceInKm(userLat, userLng, sim.lat, sim.lng));
  });

  const squadModal = document.getElementById('squad-modal');
  const btnGroupToggle = document.getElementById('btn-group-toggle');
  const txtGroupToggle = document.getElementById('text-group-toggle');
  const activeSquadPill = document.getElementById('active-squad-pill');
  const squadCodeDisplay = document.getElementById('squad-code-display');
  const inputSquadCode = document.getElementById('input-squad-code');
  const inputRiderName = document.getElementById('input-rider-name');
  const btnLeaveSquad = document.getElementById('btn-leave-squad');

  function refreshSquadUI() {
    if (activeSquadCode) {
      btnGroupToggle.classList.add('active-green');
      txtGroupToggle.textContent = 'Squad: ON';
      activeSquadPill.classList.remove('hidden');
      squadCodeDisplay.textContent = `SQUAD: ${activeSquadCode}`;
      btnLeaveSquad.classList.remove('hidden');
      inputSquadCode.value = activeSquadCode;
    } else {
      btnGroupToggle.classList.remove('active-green');
      txtGroupToggle.textContent = 'Solo Ride';
      activeSquadPill.classList.add('hidden');
      btnLeaveSquad.classList.add('hidden');
    }
    inputRiderName.value = riderName;
    document.getElementById('profile-display-name').textContent = riderName;
  }
  refreshSquadUI();

  btnGroupToggle.addEventListener('click', () => squadModal.classList.remove('hidden'));
  document.getElementById('btn-close-squad-modal').addEventListener('click', () => squadModal.classList.add('hidden'));
  document.getElementById('btn-generate-code').addEventListener('click', () => {
    inputSquadCode.value = `ZN-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  document.getElementById('btn-join-squad').addEventListener('click', () => {
    const codeVal = inputSquadCode.value.trim().toUpperCase();
    if (!codeVal) return;
    riderName = inputRiderName.value.trim() || 'MD. Rasel Islam';
    activeSquadCode = codeVal;
    localStorage.setItem('zenvo_rider_name', riderName);
    localStorage.setItem('zenvo_squad_code', activeSquadCode);
    refreshSquadUI();
    squadModal.classList.add('hidden');
  });

  btnLeaveSquad.addEventListener('click', () => {
    activeSquadCode = '';
    localStorage.removeItem('zenvo_squad_code');
    refreshSquadUI();
    squadModal.classList.add('hidden');
  });

  const socialPosts = [
    {
      id: 'p1',
      author: 'Zenvo_Sakib',
      bike: 'Yamaha R15M • Thakurgaon',
      caption: 'Morning highway run with the squad! Road is completely clear near Salandar. Ride safe brothers! 🏍️🔥',
      image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80',
      likes: 124,
      views: '1.8K',
      sponsor: 'Motul 7100 10W40 Full Synthetic - 10% Off at Thakurgaon Moto Parts',
      liked: false,
    },
  ];

  const upcomingEvents = [
    {
      id: 'e1',
      title: 'Friday Morning Tea Ride to Tetulia',
      meta: 'Friday, 6:30 AM • Starting from Thakurgaon Chowrasta',
      joinedCount: 28,
      isJoined: false,
    },
  ];

  function updateCreatorEarnings(addAmount = 0) {
    creatorEarnings = +(creatorEarnings + addAmount).toFixed(2);
    localStorage.setItem('zenvo_earnings', creatorEarnings.toString());
    document.getElementById('creator-earnings-val').textContent = `$${creatorEarnings.toFixed(2)}`;
  }
  updateCreatorEarnings(0);

  function renderEventsList() {
    const evContainer = document.getElementById('events-container');
    evContainer.innerHTML = '';
    upcomingEvents.forEach((ev) => {
      const el = document.createElement('div');
      el.className = 'event-card';
      el.innerHTML = `
        <div><h4 class="event-title">${ev.title}</h4><p class="event-meta">${ev.meta}</p><span class="event-joined">${ev.joinedCount} Going</span></div>
        <button class="btn-join-event" data-event-id="${ev.id}" type="button">${ev.isJoined ? '✓ Joined' : 'Join'}</button>
      `;
      evContainer.appendChild(el);
    });

    document.querySelectorAll('[data-event-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const evId = btn.getAttribute('data-event-id');
        const evObj = upcomingEvents.find((e) => e.id === evId);
        if (evObj && !evObj.isJoined) {
          evObj.isJoined = true;
          evObj.joinedCount += 1;
          renderEventsList();
          showZenvoModal('🏍️ SQUAD RIDE JOINED!', `You are registered for "${evObj.title}".`);
        }
      });
    });
  }

  document.querySelectorAll('.sub-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const targetSub = btn.getAttribute('data-subtab');
      document.getElementById('feed-view').classList.toggle('hidden', targetSub !== 'feed-view');
      document.getElementById('community-view').classList.toggle('hidden', targetSub !== 'community-view');
      document.getElementById('people-view').classList.toggle('hidden', targetSub !== 'people-view');
      document.getElementById('youtube-view').classList.toggle('hidden', targetSub !== 'youtube-view');
      if (targetSub === 'youtube-view') initYouTubeFeed();
    });
  });

  const uploadModal = document.getElementById('upload-post-modal');
  document.getElementById('btn-open-upload').addEventListener('click', () => uploadModal.classList.remove('hidden'));
  document.getElementById('btn-close-upload-modal').addEventListener('click', () => uploadModal.classList.add('hidden'));


  document.getElementById('btn-withdraw-earnings').addEventListener('click', () => {
    showZenvoModal('💳 PAYOUT WALLET', `Balance: $${creatorEarnings.toFixed(2)} USD. Ready for payout.`);
  });

  document.getElementById('btn-post-blood-req').addEventListener('click', () => {
    showZenvoModal('🩸 BLOOD SOS', 'Emergency blood request broadcasted to riders within 15KM.');
  });

  const rideRequests = [
    { id: 'r1', type: 'PASSENGER RIDE', pickup: 'Thakurgaon Chowrasta', drop: 'Govt. College', distance: '2.4 KM', fare: 60, requester: 'Arif', lat: 26.0345, lng: 88.4632, accepted: false },
  ];

  const verifiedMechanics = [
    { id: 'm1', name: 'Bismillah Moto Doctor', specialty: 'FI Scanning & Engine', rating: '4.9 ★', location: '0.8 KM • College Road', phone: 'Rafiq', lat: 26.0352, lng: 88.4608 },
  ];

  const marketplaceItems = [
    { id: 'item1', category: 'GEAR', title: 'MT Thunder 3 Helmet', price: '6,800', seller: 'Rider Gear', image: 'https://images.unsplash.com/photo-1558980664-3a031cf67ea8?auto=format&fit=crop&w=600&q=80' },
  ];

  let currentMarketFilter = 'ALL';

  function updateRideEarningsUI(addBdt = 0) {
    rideEarningsBdt += addBdt;
    localStorage.setItem('zenvo_ride_bdt', rideEarningsBdt.toString());
    document.getElementById('ride-earnings-bdt').textContent = rideEarningsBdt;
  }
  updateRideEarningsUI(0);

  function renderRideRequests() {
    const container = document.getElementById('ride-requests-container');
    container.innerHTML = '';
    rideRequests.forEach((req) => {
      const card = document.createElement('div');
      card.className = 'ride-card';
      card.innerHTML = `
        <div class="ride-card-top"><span class="ride-type-badge">${esc(req.type)}</span><span class="ride-fare">৳${req.fare}</span></div>
        <div class="ride-route">Pickup: ${esc(req.pickup)}<br>Drop: ${esc(req.drop)}</div>
        <div class="ride-meta-row">
          <span>By ${esc(req.requester)}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn-map-route" data-map-ride="${req.id}" type="button">Map</button>
            <button class="btn-accept-ride ${req.accepted ? 'accepted' : ''}" data-accept-ride="${req.id}" type="button">${req.accepted ? 'Accepted' : 'Accept'}</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    document.querySelectorAll('[data-accept-ride]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rId = btn.getAttribute('data-accept-ride');
        const target = rideRequests.find((r) => r.id === rId);
        if (target && !target.accepted) {
          target.accepted = true;
          updateRideEarningsUI(target.fare);
          renderRideRequests();
          showZenvoModal('🏍️ RIDE ACCEPTED!', `+৳${target.fare} added to wallet!`);
        }
      });
    });

    document.querySelectorAll('[data-map-ride]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rId = btn.getAttribute('data-map-ride');
        const target = rideRequests.find((r) => r.id === rId);
        if (target) jumpToMapAndPin(target.lat, target.lng, 'PICKUP', target.requester, target.pickup);
      });
    });
  }

  function renderMechanicsList() {
    const container = document.getElementById('mechanics-container');
    container.innerHTML = '';
    verifiedMechanics.forEach((mech) => {
      const card = document.createElement('div');
      card.className = 'mechanic-card';
      card.innerHTML = `
        <div class="mech-header"><h4 class="mech-name">${esc(mech.name)}</h4><span class="mech-rating">${esc(mech.rating)}</span></div>
        <p class="mech-loc">${esc(mech.location)}</p>
        <div class="mech-actions">
          <button class="btn-mech-gps" data-send-gps="${esc(mech.name)}" type="button">Send GPS</button>
          <button class="btn-mech-gps" data-map-mech="${mech.id}" type="button">Locate</button>
        </div>
      `;
      container.appendChild(card);
    });

    document.querySelectorAll('[data-map-mech]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mId = btn.getAttribute('data-map-mech');
        const mech = verifiedMechanics.find((m) => m.id === mId);
        if (mech) jumpToMapAndPin(mech.lat, mech.lng, 'GARAGE', mech.name, mech.specialty);
      });
    });
  }

  const checkoutModal = document.getElementById('checkout-modal');
  let selectedCheckoutItem = null;

  function renderMarketplace() {
    const grid = document.getElementById('marketplace-grid');
    grid.innerHTML = '';
    const filtered = marketplaceItems.filter(i => currentMarketFilter === 'ALL' || i.category === currentMarketFilter);
    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <img src="${esc(item.image)}" alt="Item" class="product-img" />
        <div class="product-info">
          <div><h4 class="product-title">${esc(item.title)}</h4><div class="product-price">৳${esc(item.price)}</div></div>
          <button class="btn-buy-item" data-buy-id="${item.id}" type="button">Buy / Book</button>
        </div>
      `;
      grid.appendChild(card);
    });

    document.querySelectorAll('[data-buy-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCheckoutItem = marketplaceItems.find(i => i.id === btn.getAttribute('data-buy-id'));
        if (selectedCheckoutItem) {
          document.getElementById('checkout-item-summary').textContent = `${selectedCheckoutItem.title} — ৳${selectedCheckoutItem.price}`;
          checkoutModal.classList.remove('hidden');
        }
      });
    });
  }

  document.getElementById('btn-close-checkout-modal').addEventListener('click', () => checkoutModal.classList.add('hidden'));
  document.getElementById('btn-confirm-order').addEventListener('click', () => {
    checkoutModal.classList.add('hidden');
    showZenvoModal('✅ ORDER CONFIRMED!', 'Order booked successfully.');
  });

  document.querySelectorAll('.shop-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-shoptab');
      document.getElementById('rideshare-view').classList.toggle('hidden', target !== 'rideshare-view');
      document.getElementById('mechanic-view').classList.toggle('hidden', target !== 'mechanic-view');
      document.getElementById('market-view').classList.toggle('hidden', target !== 'market-view');
    });
  });

  document.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentMarketFilter = pill.getAttribute('data-filter');
      renderMarketplace();
    });
  });

  const rideReqModal = document.getElementById('ride-req-modal');
  document.getElementById('btn-open-ride-req').addEventListener('click', () => rideReqModal.classList.remove('hidden'));
  document.getElementById('btn-close-ride-modal').addEventListener('click', () => rideReqModal.classList.add('hidden'));

  document.getElementById('btn-submit-ride-req').addEventListener('click', () => {
    rideRequests.unshift({
      id: 'r_' + Date.now(),
      type: document.getElementById('input-ride-type').value,
      pickup: document.getElementById('input-ride-pickup').value || 'Sadar',
      drop: document.getElementById('input-ride-drop').value || 'College',
      distance: '3 KM',
      fare: 100,
      requester: riderName,
      lat: userLat + 0.002,
      lng: userLng - 0.002,
      accepted: false,
    });
    renderRideRequests();
    rideReqModal.classList.add('hidden');
    showZenvoModal('📡 BROADCASTED!', 'Nearby bikers notified.');
  });

  const sellModal = document.getElementById('sell-item-modal');
  document.getElementById('btn-open-sell-modal').addEventListener('click', () => sellModal.classList.remove('hidden'));
  document.getElementById('btn-close-sell-modal').addEventListener('click', () => sellModal.classList.add('hidden'));

  document.getElementById('btn-submit-sell-item').addEventListener('click', async () => {
    marketplaceItems.unshift({
      id: 'item_' + Date.now(),
      category: document.getElementById('input-item-category').value,
      title: document.getElementById('input-item-title').value || 'Item',
      price: document.getElementById('input-item-price').value || '1,000',
      seller: riderName,
      image: await readImage('input-item-file', 'https://images.unsplash.com/photo-1558980664-3a031cf67ea8?auto=format&fit=crop&w=600&q=80'),
    });
    renderMarketplace();
    sellModal.classList.add('hidden');
    showZenvoModal('🏷️ LISTED!', 'Item published.');
  });

  function activateHandsFreeVoiceGuard() {
    broadcastZenvoAlert('POLICE', 'Voice Guard: Police Ahead');
  }
  document.getElementById('btn-voice-ai').addEventListener('click', activateHandsFreeVoiceGuard);
  document.getElementById('btn-trigger-voice-guard').addEventListener('click', activateHandsFreeVoiceGuard);

  document.querySelectorAll('.ai-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-aitab');
      document.getElementById('ai-legal-view').classList.toggle('hidden', target !== 'ai-legal-view');
      document.getElementById('ai-engine-view').classList.toggle('hidden', target !== 'ai-engine-view');
      document.getElementById('ai-vault-view').classList.toggle('hidden', target !== 'ai-vault-view');
    });
  });

  // ---------- YouTube discovery feed (official Data API; API key required) ----------
  let ytKey = localStorage.getItem('zenvo_youtube_api_key') || '';
  let ytNextPage = '';
  let ytQuery = 'motorcycle riding';
  let ytLoading = false;
  let ytInitialized = false;
  const ytFeed = document.getElementById('youtube-feed');
  const ytStatus = document.getElementById('yt-status');
  function youtubeCard(item) {
    const id = item.id && (item.id.videoId || item.id);
    const snippet = item.snippet || {};
    if (!id) return '';
    return `<article class="yt-video-card"><div class="yt-player-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" title="${esc(snippet.title || 'YouTube video')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><div class="yt-video-meta"><strong>${esc(snippet.title || 'YouTube video')}</strong><span>${esc(snippet.channelTitle || 'YouTube creator')}</span><p>${esc((snippet.description || '').slice(0, 180))}</p><a href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a></div></article>`;
  }
  async function loadYouTubePage(reset = false) {
    if (ytLoading) return;
    if (!ytKey) { ytStatus.textContent = 'Add a YouTube Data API key to enable live search and continuous pagination.'; return; }
    if (!reset && !ytNextPage && ytInitialized) { ytStatus.textContent = 'No more results for this search.'; return; }
    ytLoading = true;
    ytStatus.textContent = 'Loading videos…';
    if (reset) { ytNextPage = ''; ytFeed.innerHTML = ''; }
    try {
      const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '10', q: ytQuery, key: ytKey, safeSearch: 'moderate' });
      if (ytNextPage && !reset) params.set('pageToken', ytNextPage);
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : `YouTube API error ${res.status}`);
      const items = (data.items || []).filter(x => x.id && x.id.videoId);
      ytFeed.insertAdjacentHTML('beforeend', items.map(youtubeCard).join(''));
      ytNextPage = data.nextPageToken || '';
      ytInitialized = true;
      ytStatus.textContent = items.length ? `Showing results for “${ytQuery}”. Scroll down or tap Load more videos.` : 'No videos found. Try another search.';
      document.getElementById('btn-yt-load-more').classList.toggle('hidden', !ytNextPage);
    } catch (err) {
      ytStatus.textContent = `Could not load YouTube videos: ${err.message}. Check the API key, API restrictions, and quota.`;
    } finally { ytLoading = false; }
  }
  function initYouTubeFeed() {
    if (!ytInitialized && ytKey) loadYouTubePage(true);
    else if (!ytKey) ytStatus.textContent = 'Configure a restricted YouTube Data API key to search and load videos. YouTube playback uses its official player.';
  }
  document.getElementById('btn-yt-config').addEventListener('click', () => {
    const val = window.prompt('Paste your YouTube Data API v3 key. Restrict it by website/referrer in Google Cloud Console.', ytKey);
    if (val === null) return;
    ytKey = val.trim();
    if (ytKey) localStorage.setItem('zenvo_youtube_api_key', ytKey); else localStorage.removeItem('zenvo_youtube_api_key');
    ytInitialized = false; loadYouTubePage(true);
  });
  document.getElementById('btn-yt-search').addEventListener('click', () => {
    ytQuery = document.getElementById('yt-search-input').value.trim() || 'motorcycle riding';
    ytInitialized = false; ytNextPage = ''; loadYouTubePage(true);
  });
  document.getElementById('yt-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-yt-search').click(); });
  document.getElementById('btn-yt-load-more').addEventListener('click', () => loadYouTubePage(false));
  const ytObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && !document.getElementById('youtube-view').classList.contains('hidden') && ytNextPage) loadYouTubePage(false); }, { root: document.getElementById('youtube-view'), rootMargin: '500px' }) : null;
  if (ytObserver) ytObserver.observe(document.getElementById('youtube-sentinel'));

  const chatHistory = [{ sender: 'bot', text: '👋 Assalamu Alaikum! I am your Zenvo Legal AI Advisor (BD Road Transport Act 2018).' }];
  function renderAIChat() {
    const box = document.getElementById('ai-chat-messages');
    box.innerHTML = '';
    chatHistory.forEach(msg => {
      box.innerHTML += `<div class="chat-bubble ${msg.sender}">${esc(msg.text)}</div>`;
    });
    box.scrollTop = box.scrollHeight;
  }
  renderAIChat();

  let aiAttachment = null;
  const AI_ENDPOINT = (window.ZENVO_CONFIG && window.ZENVO_CONFIG.aiEndpoint) || '/api/ai/chat';
  function renderAIAttachment() {
    const box = document.getElementById('ai-attachment-preview');
    if (!aiAttachment) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const isImage = aiAttachment.type.startsWith('image/');
    box.innerHTML = `<div class="ai-attachment-chip">${isImage ? `<img src="${aiAttachment.preview}" alt="Attachment preview" />` : '<i class="ri-file-text-line"></i>'}<span>${esc(aiAttachment.name)} · ${Math.max(1, Math.round(aiAttachment.size / 1024))} KB</span><button id="btn-remove-ai-attachment" type="button" aria-label="Remove attachment">×</button></div>`;
    document.getElementById('btn-remove-ai-attachment').addEventListener('click', () => { aiAttachment = null; renderAIAttachment(); });
  }
  function selectAIAttachment(file) {
    if (!file) return;
    const allowed = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/plain|text\/csv|application\/json)$/i.test(file.type) || /\.(pdf|txt|csv|md|json|js|html|css)$/i.test(file.name);
    if (!allowed) { showZenvoModal('Unsupported file', 'Choose an image, PDF, TXT, CSV, MD, JSON, JS, HTML, or CSS file.'); return; }
    if (file.size > 12 * 1024 * 1024) { showZenvoModal('File too large', 'Please choose a file smaller than 12 MB.'); return; }
    aiAttachment = { file, name: file.name, type: file.type || 'application/octet-stream', size: file.size, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' };
    renderAIAttachment();
  }
  document.getElementById('btn-ai-attach').addEventListener('click', () => {
    const choice = window.prompt('Attach: type 1 for Camera, 2 for Gallery/Files', '2');
    if (choice === '1') document.getElementById('ai-camera-input').click(); else if (choice === '2') document.getElementById('ai-file-input').click();
  });
  document.getElementById('ai-file-input').addEventListener('change', e => { selectAIAttachment(e.target.files[0]); e.target.value = ''; });
  document.getElementById('ai-camera-input').addEventListener('change', e => { selectAIAttachment(e.target.files[0]); e.target.value = ''; });
  async function handleSendAIChat(customText) {
    const input = document.getElementById('input-ai-question');
    const text = customText || input.value.trim();
    if (!text && !aiAttachment) return;
    const attachment = aiAttachment;
    chatHistory.push({ sender: 'user', text: (text || 'Please analyze this attachment.') + (attachment ? `\n📎 ${attachment.name}` : '') });
    input.value = ''; aiAttachment = null; renderAIAttachment(); renderAIChat();
    const waiting = { sender: 'bot', text: 'Thinking…' }; chatHistory.push(waiting); renderAIChat();
    try {
      const form = new FormData(); form.append('message', text || 'Please analyze the attached file and explain the result.');
      if (attachment) form.append('file', attachment.file, attachment.name);
      const response = await fetch(AI_ENDPOINT, { method: 'POST', body: form, headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`AI backend returned ${response.status}`);
      const data = await response.json(); waiting.text = data.reply || data.output_text || 'The AI service returned an empty response.';
    } catch (err) {
      waiting.text = attachment ? `Attachment selected (${attachment.name}), but its contents were not analyzed because the AI backend is not configured or reachable. Configure window.ZENVO_CONFIG.aiEndpoint.\n\n${text ? lawReply(text) : 'Connect the AI backend to analyze this file.'}` : `AI backend is not connected; this is local guidance, not a live AI answer.\n\n${lawReply(text)}`;
    }
    renderAIChat();
  }

  document.getElementById('btn-send-ai-chat').addEventListener('click', () => handleSendAIChat());
  document.querySelectorAll('.law-chip').forEach(chip => {
    chip.addEventListener('click', () => handleSendAIChat(chip.getAttribute('data-law-q')));
  });

  document.getElementById('btn-start-engine-scan').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const bars = document.querySelectorAll('.freq-bar');
    const status = document.getElementById('engine-scan-status');
    btn.disabled = true;
    status.textContent = '🎙️ Analyzing engine sound...';
    const anim = setInterval(() => bars.forEach((b) => { b.style.height = `${10 + Math.random() * 34}px`; }), 150);
    setTimeout(() => {
      clearInterval(anim);
      bars.forEach((b) => { b.style.height = ''; });
      btn.disabled = false;
      status.textContent = '✅ Scan complete (demo result)';
      showZenvoModal('🔧 ENGINE REPORT (DEMO)', 'Simulated result: idle RPM stable, no tappet knock. Real microphone analysis is not connected yet, so see a mechanic for an actual diagnosis.');
    }, 5000);
  });

  function updateMileageUI() {
    document.getElementById('odom-val').textContent = odometerKm.toLocaleString();
    document.getElementById('next-oil-val').textContent = nextOilKm.toLocaleString();
    const pct = document.getElementById('oil-health-pct');
    pct.textContent = `${oilHealth}% ${oilHealth > 60 ? 'Good' : oilHealth > 30 ? 'Fair' : 'Change Soon'}`;
    pct.style.color = oilHealth > 60 ? '#00E676' : oilHealth > 30 ? '#FF9F1C' : '#FF2A4B';
    document.getElementById('oil-progress-fill').style.width = `${oilHealth}%`;
    localStorage.setItem('zenvo_odom_km', odometerKm.toString());
    localStorage.setItem('zenvo_oil_health', oilHealth.toString());
  }
  updateMileageUI();

  document.getElementById('btn-add-trip-km').addEventListener('click', () => {
    odometerKm += 50;
    oilHealth = Math.max(0, oilHealth - 2);
    updateMileageUI();
  });

  const savedDocs = [
    { id: 'd1', title: 'BRTA Driving License', number: 'DL-8849-THK', expiry: '2028-05-14', image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=600&q=80' },
  ];

  function docBadge(doc) {
    const days = Math.ceil((new Date(doc.expiry) - new Date()) / 86400000);
    if (isNaN(days)) return '';
    if (days < 0) return '<span class="doc-expiry-badge doc-warn">Expired</span>';
    if (days <= 15) return `<span class="doc-expiry-badge doc-warn">Expires in ${days} days</span>`;
    return `<span class="doc-expiry-badge doc-ok">Valid till ${esc(doc.expiry)}</span>`;
  }

  function renderDocVault() {
    const container = document.getElementById('doc-vault-container');
    container.innerHTML = '';
    savedDocs.forEach(doc => {
      container.innerHTML += `
        <div class="doc-card">
          <div class="doc-icon-box"><i class="ri-shield-check-fill"></i></div><div style="flex:1;"><h4 class="doc-title">${esc(doc.title)}</h4><p class="doc-num">ID: ${esc(doc.number)}</p>${docBadge(doc)}</div>
          <button class="btn-view-doc" data-view-doc="${doc.id}" type="button">View</button>
        </div>
      `;
    });
    document.querySelectorAll('[data-view-doc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = savedDocs.find(d => d.id === btn.getAttribute('data-view-doc'));
        if (target) {
          document.getElementById('view-doc-heading').textContent = target.title;
          document.getElementById('view-doc-meta').textContent = `ID: ${target.number} • Expiry: ${target.expiry}`;
          document.getElementById('view-doc-img').src = target.image;
          document.getElementById('view-doc-modal').classList.remove('hidden');
        }
      });
    });
  }
  renderDocVault();

  document.getElementById('btn-close-view-doc').addEventListener('click', () => document.getElementById('view-doc-modal').classList.add('hidden'));
  const docModal = document.getElementById('doc-vault-modal');
  document.getElementById('btn-open-doc-modal').addEventListener('click', () => docModal.classList.remove('hidden'));
  document.getElementById('btn-close-doc-modal').addEventListener('click', () => docModal.classList.add('hidden'));

  document.getElementById('btn-save-doc').addEventListener('click', async () => {
    savedDocs.unshift({
      id: 'd_' + Date.now(),
      title: document.getElementById('input-doc-title').value,
      number: document.getElementById('input-doc-number').value.trim() || 'N/A',
      expiry: document.getElementById('input-doc-expiry').value || '2027-01-01',
      image: await readImage('input-doc-file', 'https://images.unsplash.com/photo-1558980664-3a031cf67ea8?auto=format&fit=crop&w=600&q=80'),
    });
    renderDocVault();
    docModal.classList.add('hidden');
    showZenvoModal('🔒 SAVED', 'Document encrypted in vault.');
  });
  const stolenBikesList = [
    { id: 'sb1', model: 'Yamaha R15 V3', plate: 'THAKURGAON-LA-11-8832', lastSeen: 'Kalibari Market', reward: '15,000', owner: 'Nayeem', lat: 26.0318, lng: 88.4655 },
  ];

  const leaderboardData = [
    { rank: 1, name: 'MD. Rasel Islam (You)', score: '98 Trust • 42 Alerts', badge: '🏆 Top Hero' },
    { rank: 2, name: 'Zenvo_Sakib', score: '96 Trust • 39 Alerts', badge: '⚡ Squad Leader' },
  ];

  function renderStolenBikes() {
    const container = document.getElementById('stolen-bikes-container');
    container.innerHTML = '';
    stolenBikesList.forEach(sb => {
      container.innerHTML += `
        <div class="stolen-card">
          <div class="ride-card-top"><span class="plate-badge">${esc(sb.plate)}</span><span class="ride-fare">Reward: ৳${esc(sb.reward)}</span></div>
          <h4 class="mech-name">${esc(sb.model)}</h4>
          <p class="mech-loc">Last Seen: ${esc(sb.lastSeen)}</p>
          <button class="btn-mech-gps" data-track-stolen="${sb.id}" type="button">Pin on Radar</button>
        </div>
      `;
    });
    document.querySelectorAll('[data-track-stolen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = stolenBikesList.find(s => s.id === btn.getAttribute('data-track-stolen'));
        if (target) jumpToMapAndPin(target.lat, target.lng, 'STOLEN', target.plate, target.model);
      });
    });
  }

  function renderLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    container.innerHTML = '';
    leaderboardData.forEach(u => {
      container.innerHTML += `<div class="leader-row"><div style="display:flex; gap:10px;"><div class="leader-rank">#${u.rank}</div><div><div class="post-username">${esc(u.name)}</div><div class="post-bike-tag">${esc(u.score)}</div></div></div><span class="earn-badge">${esc(u.badge)}</span></div>`;
    });
  }

  function renderAdminPanel() {
    document.getElementById('admin-vendors-container').innerHTML = `<div class="event-card"><div><h4 class="event-title">New Speed Moto Parts</h4><p class="event-meta">College Road</p></div><button class="btn-join-event" type="button" onclick="alert('Approved!')">Approve</button></div>`;
    document.getElementById('admin-trolls-container').innerHTML = `<div class="event-card"><div style="flex:1;"><h4 class="event-title" style="color:#FF2A4B;">FakeUser_404</h4><p class="event-meta">Spam alerts</p></div><button class="btn-sell-item" type="button" onclick="alert('Banned!')">Ban</button></div>`;
  }

  renderStolenBikes();
  renderLeaderboard();
  renderAdminPanel();

  document.querySelectorAll('.prof-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.prof-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-proftab');
      document.getElementById('prof-stolen-view').classList.toggle('hidden', target !== 'prof-stolen-view');
      document.getElementById('prof-mesh-view').classList.toggle('hidden', target !== 'prof-mesh-view');
      document.getElementById('prof-admin-view').classList.toggle('hidden', target !== 'prof-admin-view');
    });
  });

  const stolenModal = document.getElementById('stolen-bike-modal');
  document.getElementById('btn-open-stolen-modal').addEventListener('click', () => stolenModal.classList.remove('hidden'));
  document.getElementById('btn-close-stolen-modal').addEventListener('click', () => stolenModal.classList.add('hidden'));

  document.getElementById('btn-submit-stolen').addEventListener('click', () => {
    stolenBikesList.unshift({
      id: 'sb_' + Date.now(),
      model: document.getElementById('input-stolen-model').value || 'Bike',
      plate: document.getElementById('input-stolen-plate').value || 'PLATE',
      lastSeen: document.getElementById('input-stolen-loc').value || 'Sadar',
      reward: document.getElementById('input-stolen-reward').value || '5,000',
      owner: riderName,
      lat: userLat + 0.003,
      lng: userLng - 0.002,
    });
    renderStolenBikes();
    stolenModal.classList.add('hidden');
    showZenvoModal('🚨 ALERT BROADCASTED!', 'Stolen bike notice sent to all riders.');
  });

  document.getElementById('btn-scan-ble-peers').addEventListener('click', () => {
    showZenvoModal('📡 MESH SCAN', 'Connected to 2 nearby BLE biker nodes.');
  });

  document.getElementById('btn-send-offline-sms').addEventListener('click', () => {
    window.location.href = `sms:?body=${encodeURIComponent(`ZENVO EMERGENCY SOS! GPS: https://maps.google.com/?q=${userLat},${userLng}`)}`;
  });

  document.getElementById('btn-test-crash-sensor').addEventListener('click', () => {
    broadcastZenvoAlert('ACCIDENT', 'Auto-Crash Impact SOS');
  });

  document.getElementById('btn-lang-toggle').addEventListener('click', () => {
    currentLang = currentLang === 'EN' ? 'BN' : 'EN';
    const isBn = currentLang === 'BN';
    document.getElementById('i18n-tab-radar').textContent = isBn ? 'রাডার' : 'Radar';
    document.getElementById('i18n-tab-social').textContent = isBn ? 'সোশ্যাল' : 'Social';
    document.getElementById('i18n-tab-shop').textContent = isBn ? 'রাইড ও শপ' : 'Ride & Shop';
    document.getElementById('i18n-tab-ai').textContent = isBn ? 'জেনভো এআই' : 'Zenvo AI';
    document.getElementById('i18n-tab-profile').textContent = isBn ? 'প্রোফাইল' : 'Profile';
  });

  let callStream = null;
  let callTimerId = null;

  function stopCall() {
    clearInterval(callTimerId);
    if (callStream) callStream.getTracks().forEach((t) => t.stop());
    callStream = null;
    document.getElementById('call-modal').classList.add('hidden');
  }

  async function startLiveRiderCall(targetRider) {
    const modal = document.getElementById('call-modal');
    const timerEl = document.getElementById('call-timer');
    document.getElementById('call-target-name').textContent = targetRider;
    document.getElementById('call-status-text').textContent = 'Demo call preview (no live connection yet)';
    document.querySelectorAll('.call-ctrl-btn.off').forEach((b) => b.classList.remove('off'));
    modal.classList.remove('hidden');
    let secs = 0;
    timerEl.textContent = '00:00';
    clearInterval(callTimerId);
    callTimerId = setInterval(() => {
      secs += 1;
      timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    }, 1000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (modal.classList.contains('hidden')) { stream.getTracks().forEach((t) => t.stop()); return; }
      callStream = stream;
      document.getElementById('local-Camera-video').srcObject = stream;
    } catch (err) { /* permission denied: continue without preview */ }
  }

  function toggleTrack(kind, btnId) {
    if (!callStream) return;
    const tracks = kind === 'video' ? callStream.getVideoTracks() : callStream.getAudioTracks();
    const turnOn = !(tracks[0] && tracks[0].enabled);
    tracks.forEach((t) => { t.enabled = turnOn; });
    document.getElementById(btnId).classList.toggle('off', !turnOn);
  }

  function bindCallButtons() {
    document.querySelectorAll('[data-call-rider]').forEach(btn => {
      btn.onclick = () => startLiveRiderCall(btn.getAttribute('data-call-rider'));
    });
  }

  document.getElementById('btn-end-call').addEventListener('click', () => (pc ? endCall(true) : stopCall()));
  document.getElementById('btn-toggle-mic').addEventListener('click', () => toggleTrack('audio', 'btn-toggle-mic'));
  document.getElementById('btn-toggle-cam').addEventListener('click', () => toggleTrack('video', 'btn-toggle-cam'));

  renderEventsList();
  renderRideRequests();
  renderMechanicsList();
  renderMarketplace();

  document.getElementById('input-ai-question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendAIChat();
  });

  document.getElementById('btn-reset-oil').addEventListener('click', () => {
    oilHealth = 100;
    nextOilKm = odometerKm + 3000;
    localStorage.setItem('zenvo_next_oil', nextOilKm.toString());
    updateMileageUI();
    showZenvoModal('🛢️ OIL RESET', `Oil health is back to 100%. Next change set at ${nextOilKm.toLocaleString()} KM (3,000 KM interval, adjust it to your bike manual).`);
  });

  document.getElementById('btn-broadcast-breakdown').addEventListener('click', () => {
    broadcastZenvoAlert('HAZARD', 'Breakdown: Mechanic Needed');
  });

  document.querySelectorAll('[data-send-gps]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = `ZENVO BREAKDOWN HELP (${btn.getAttribute('data-send-gps')}): https://maps.google.com/?q=${userLat},${userLng}`;
      window.location.href = `sms:?body=${encodeURIComponent(msg)}`;
    });
  });

  // Live alerts from other riders (only when Firebase keys are set)
  if (isFirebaseConnected) {
    const startedAt = Date.now();
    db.ref('zenvo_hazards').orderByChild('ts').startAt(startedAt - 3600000).on('child_added', (snap) => {
      const a = snap.val();
      if (!a || hazards.some((h) => h.id === a.id)) return;
      if (a.squadCode && a.squadCode !== activeSquadCode) return;
      hazards.unshift(a);
      addHazardToMap(a);
      updateRadarBanner();
      const d = getDistanceInKm(userLat, userLng, a.lat, a.lng);
      if (a.ts >= startedAt && d <= 2) triggerFullSirenOverlay(a, d);
    });
  }

  // ==========================================
  // ZENVO CONNECT: POSTS, CHAT, CALLS, PROFILE PHOTO
  // ==========================================
  const cloudReady = () => isFirebaseConnected && db;
  let myUid = localStorage.getItem('zenvo_uid');
  if (!myUid) {
    myUid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('zenvo_uid', myUid);
  }
  let myPhoto = localStorage.getItem('zenvo_photo') || '';
  let cloudUsers = {};
  let inbox = {};
  let openPostId = null;
  let chatPeer = null;
  let chatRef = null;

  const SEED_POST = {
    id: 'p1', uid: 'seed', author: 'Zenvo_Sakib', bike: 'Yamaha R15M • Thakurgaon',
    caption: 'Morning highway run with the squad! Road is completely clear near Salandar. Ride safe brothers! 🏍️🔥',
    image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80',
    ts: Date.now() - 7200000, likedBy: {}, baseLikes: 124, comments: {},
    sponsor: 'Motul 7100 10W40 Full Synthetic - 10% Off at Thakurgaon Moto Parts',
  };
  let posts = [];
  if (!cloudReady()) {
    try { posts = JSON.parse(localStorage.getItem('zenvo_posts') || 'null') || [SEED_POST]; } catch (e) { posts = [SEED_POST]; }
  }
  function savePostsLocal() {
    if (cloudReady()) return;
    try { localStorage.setItem('zenvo_posts', JSON.stringify(posts.slice(0, 30))); } catch (e) { /* storage full */ }
  }

  function needCloud(feature) {
    showZenvoModal('☁️ CLOUD SYNC NEEDED', `${feature} works between different phones only after you add your Firebase keys at the top of script.js. Until then the app runs in local mode on this device.`);
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return `${Math.floor(s / 86400)} days ago`;
  }

  function compressImage(file, max, quality) {
    return new Promise((resolve) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onerror = () => resolve('');
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => resolve('');
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k);
          cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function userInfo(uid, fallbackName) {
    if (uid === myUid) return { name: riderName, photo: myPhoto };
    const u = cloudUsers[uid];
    return { name: (u && u.name) || fallbackName || 'Rider', photo: (u && u.photo) || '' };
  }

  function avatarHTML(photo, name, cls) {
    if (photo) return `<img class="${cls} av-img" src="${esc(photo)}" alt="" />`;
    return `<div class="${cls}">${esc((name || 'R').charAt(0).toUpperCase())}</div>`;
  }

  function registerUser() {
    if (cloudReady()) db.ref('zenvo_users/' + myUid).set({ name: riderName, photo: myPhoto || '', ts: Date.now() });
  }

  // ---------- Profile photo ----------
  function renderAvatar() {
    const el = document.getElementById('profile-avatar');
    el.innerHTML = (myPhoto ? `<img src="${esc(myPhoto)}" alt="" class="av-img-fill" />` : `<span id="profile-avatar-letter">${esc(riderName.charAt(0).toUpperCase())}</span>`) + '<i class="ri-camera-fill avatar-cam"></i>';
  }
  document.getElementById('profile-avatar').addEventListener('click', () => document.getElementById('input-profile-photo').click());
  document.getElementById('input-profile-photo').addEventListener('change', async (e) => {
    const data = await compressImage(e.target.files[0], 240, 0.8);
    e.target.value = '';
    if (!data) return;
    myPhoto = data;
    try { localStorage.setItem('zenvo_photo', data); } catch (err) { /* ignore */ }
    renderAvatar();
    registerUser();
    renderSocialFeed();
    showZenvoModal('📸 PHOTO UPDATED', 'Your profile photo is saved' + (cloudReady() ? ' and visible to other riders.' : ' on this device.'));
  });
  document.getElementById('btn-join-squad').addEventListener('click', () => { renderAvatar(); registerUser(); renderSocialFeed(); });

  // ---------- Feed ----------
  function renderSocialFeed() {
    const box = document.getElementById('social-posts-container');
    if (!posts.length) {
      box.innerHTML = '<p class="empty-note">No posts yet. Tap “Post & Earn” and be the first rider to post!</p>';
      return;
    }
    box.innerHTML = posts.map((p) => {
      const u = userInfo(p.uid, p.author);
      const mine = p.uid === myUid;
      const likes = (p.baseLikes || 0) + Object.keys(p.likedBy || {}).length;
      const liked = !!(p.likedBy && p.likedBy[myUid]);
      const cc = Object.keys(p.comments || {}).length;
      const topBtn = mine
        ? `<button class="btn-call-rider" data-act="delete" data-id="${esc(p.id)}" type="button"><i class="ri-delete-bin-6-fill"></i></button>`
        : (p.uid === 'seed' ? '' : `<button class="btn-call-rider" data-act="chat" data-uid="${esc(p.uid)}" type="button"><i class="ri-chat-3-fill"></i> Chat</button>`);
      return `
        <div class="post-card">
          <div class="post-header">
            <div class="post-user-info">
              ${avatarHTML(u.photo, u.name, 'user-avatar')}
              <div>
                <div class="post-username">${esc(u.name)} <i class="ri-verified-badge-fill hero-verified"></i></div>
                <div class="post-bike-tag">${esc(p.bike || '')} • ${timeAgo(p.ts)}</div>
              </div>
            </div>
            ${topBtn}
          </div>
          ${p.image ? `<img src="${esc(p.image)}" alt="Post" class="post-img" />` : ''}
          <div class="post-body">
            <p class="post-caption">${esc(p.caption)}</p>
            ${p.sponsor ? `<div class="ad-slot-banner"><span class="ad-tag">AD</span><span class="ad-text">${esc(p.sponsor)}</span></div>` : ''}
            <div class="post-actions">
              <button class="action-btn ${liked ? 'liked' : ''}" data-act="like" data-id="${esc(p.id)}" type="button"><i class="${liked ? 'ri-heart-3-fill' : 'ri-heart-3-line'}"></i><span>${likes}</span></button>
              <button class="action-btn" data-act="comment" data-id="${esc(p.id)}" type="button"><i class="ri-chat-1-line"></i><span>${cc}</span></button>
              <button class="action-btn" data-act="share" data-id="${esc(p.id)}" type="button"><i class="ri-share-forward-line"></i><span>Share</span></button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  document.getElementById('social-posts-container').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'like') toggleLike(b.dataset.id);
    else if (act === 'comment') openComments(b.dataset.id);
    else if (act === 'share') sharePost(b.dataset.id);
    else if (act === 'delete') deletePost(b.dataset.id);
    else if (act === 'chat') openChat(b.dataset.uid);
  });

  function toggleLike(id) {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const had = !!(p.likedBy && p.likedBy[myUid]);
    if (cloudReady()) { db.ref(`zenvo_posts/${id}/likedBy/${myUid}`).set(had ? null : true); return; }
    p.likedBy = p.likedBy || {};
    if (had) delete p.likedBy[myUid]; else p.likedBy[myUid] = true;
    savePostsLocal();
    renderSocialFeed();
  }

  function deletePost(id) {
    if (!window.confirm('Delete this post?')) return;
    if (cloudReady()) { db.ref('zenvo_posts/' + id).remove(); return; }
    posts = posts.filter((x) => x.id !== id);
    savePostsLocal();
    renderSocialFeed();
  }

  async function sharePost(id) {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const text = `${userInfo(p.uid, p.author).name} on Zenvo: ${p.caption}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Zenvo', text, url: location.href });
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); showZenvoModal('🔗 COPIED', 'Post text and link copied. Paste it anywhere to share.'); }
    } catch (err) { /* share cancelled */ }
  }

  async function createPost() {
    const caption = document.getElementById('input-post-caption').value.trim();
    const file = document.getElementById('input-post-file').files[0];
    if (!caption && !file) return showZenvoModal('✍️ EMPTY POST', 'Write a caption or choose a photo first.');
    const btn = document.getElementById('btn-submit-post');
    btn.disabled = true;
    try {
      const image = await compressImage(file, 900, 0.72);
      const post = { uid: myUid, author: riderName, bike: document.getElementById('input-post-bike').value.trim() || 'Rider', caption, image, ts: Date.now(), sponsor: 'Zenvo Sponsor Ad' };
      if (cloudReady()) await db.ref('zenvo_posts').push(post);
      else { posts.unshift({ id: 'p_' + Date.now(), likedBy: {}, comments: {}, ...post }); savePostsLocal(); renderSocialFeed(); }
      document.getElementById('input-post-caption').value = '';
      document.getElementById('input-post-file').value = '';
      uploadModal.classList.add('hidden');
      updateCreatorEarnings(0.5);
      showZenvoModal('🎉 POST LIVE!', '+$0.50 Creator Bonus added.' + (cloudReady() ? ' All riders can see your post now.' : ' (Local mode: only you can see it.)'));
    } catch (err) {
      showZenvoModal('⚠️ POST FAILED', 'Could not publish. If you use Firebase, check your database rules. ' + (err && err.message ? err.message : ''));
    }
    btn.disabled = false;
  }
  document.getElementById('btn-submit-post').addEventListener('click', createPost);

  // ---------- Comments ----------
  function renderComments() {
    const p = posts.find((x) => x.id === openPostId);
    const box = document.getElementById('comments-list');
    if (!p) { box.innerHTML = ''; return; }
    const items = Object.values(p.comments || {}).sort((a, b) => a.ts - b.ts);
    box.innerHTML = items.length
      ? items.map((c) => `<div class="comment-row"><strong>${esc(c.name)}</strong>${esc(c.text)}<small>${timeAgo(c.ts)}</small></div>`).join('')
      : '<p class="empty-note">No comments yet. Start the conversation!</p>';
    box.scrollTop = box.scrollHeight;
  }
  function openComments(id) {
    openPostId = id;
    renderComments();
    document.getElementById('comments-modal').classList.remove('hidden');
  }
  function sendComment() {
    const inp = document.getElementById('input-comment');
    const text = inp.value.trim();
    if (!text || !openPostId) return;
    inp.value = '';
    const c = { uid: myUid, name: riderName, text, ts: Date.now() };
    if (cloudReady()) { db.ref(`zenvo_posts/${openPostId}/comments`).push(c); return; }
    const p = posts.find((x) => x.id === openPostId);
    if (!p) return;
    p.comments = p.comments || {};
    p.comments['c_' + Date.now()] = c;
    savePostsLocal();
    renderSocialFeed();
    renderComments();
  }
  document.getElementById('btn-close-comments').addEventListener('click', () => { openPostId = null; document.getElementById('comments-modal').classList.add('hidden'); });
  document.getElementById('btn-send-comment').addEventListener('click', sendComment);
  document.getElementById('input-comment').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendComment(); });

  // ---------- Riders list & inbox ----------
  function renderPeople() {
    const inboxBox = document.getElementById('inbox-container');
    const ridersBox = document.getElementById('riders-container');
    if (!cloudReady()) {
      inboxBox.innerHTML = '<div class="cloud-note">☁️ Chat and calls between different phones need Firebase. Add your Firebase keys at the top of script.js and every rider who opens the app will appear here.</div>';
      ridersBox.innerHTML = '';
      return;
    }
    const chats = Object.entries(inbox).sort((a, b) => b[1].ts - a[1].ts);
    inboxBox.innerHTML = chats.length ? chats.map(([uid, c]) => {
      const u = userInfo(uid, c.name);
      return `<div class="rider-row" data-act="chat" data-uid="${esc(uid)}">${avatarHTML(u.photo, u.name, 'user-avatar')}<div class="rider-info"><div class="post-username">${esc(u.name)}</div><div class="rider-last">${esc(c.last)}</div></div><span class="post-bike-tag">${timeAgo(c.ts)}</span></div>`;
    }).join('') : '<p class="empty-note">No conversations yet. Tap a rider below to say hello.</p>';

    const riders = Object.entries(cloudUsers).filter(([uid]) => uid !== myUid);
    ridersBox.innerHTML = riders.length ? riders.map(([uid, u]) => `
      <div class="rider-row">${avatarHTML(u.photo, u.name, 'user-avatar')}
        <div class="rider-info"><div class="post-username">${esc(u.name)}</div></div>
        <div class="rider-actions">
          <button class="mini-btn" data-act="chat" data-uid="${esc(uid)}" type="button"><i class="ri-chat-3-fill"></i></button>
          <button class="mini-btn" data-act="audio" data-uid="${esc(uid)}" type="button"><i class="ri-phone-fill"></i></button>
          <button class="mini-btn" data-act="video" data-uid="${esc(uid)}" type="button"><i class="ri-vidicon-fill"></i></button>
        </div>
      </div>`).join('') : '<p class="empty-note">No other riders have joined yet. Share the app link with your friends!</p>';
  }
  document.getElementById('people-view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const uid = b.dataset.uid;
    if (b.dataset.act === 'chat') openChat(uid);
    else if (b.dataset.act === 'audio') startCall(uid, 'audio');
    else if (b.dataset.act === 'video') startCall(uid, 'video');
  });

  // ---------- Messenger-style chat ----------
  const chatIdFor = (a, b) => [a, b].sort().join('__');

  function openChat(uid) {
    if (!cloudReady()) return needCloud('Chat');
    if (!uid || uid === myUid) return;
    const u = userInfo(uid, (inbox[uid] && inbox[uid].name) || 'Rider');
    chatPeer = { uid, name: u.name };
    document.getElementById('chat-head-name').textContent = u.name;
    document.getElementById('chat-head-avatar').innerHTML = avatarHTML(u.photo, u.name, 'user-avatar');
    const box = document.getElementById('chat-messages');
    box.innerHTML = '';
    if (chatRef) chatRef.off();
    chatRef = db.ref(`zenvo_chats/${chatIdFor(myUid, uid)}/messages`).limitToLast(100);
    chatRef.on('child_added', (snap) => {
      const m = snap.val();
      const t = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      box.insertAdjacentHTML('beforeend', `<div class="chat-bubble ${m.from === myUid ? 'user' : 'bot'}">${esc(m.text)}<small class="msg-time">${t}</small></div>`);
      box.scrollTop = box.scrollHeight;
    });
    document.getElementById('chat-modal').classList.remove('hidden');
  }
  function closeChat() {
    if (chatRef) chatRef.off();
    chatRef = null;
    chatPeer = null;
    document.getElementById('chat-modal').classList.add('hidden');
  }
  function sendChat() {
    if (!chatPeer) return;
    const inp = document.getElementById('input-chat-msg');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    const ts = Date.now();
    db.ref(`zenvo_chats/${chatIdFor(myUid, chatPeer.uid)}/messages`).push({ from: myUid, name: riderName, text, ts });
    db.ref(`zenvo_userchats/${myUid}/${chatPeer.uid}`).set({ name: chatPeer.name, last: text.slice(0, 60), ts });
    db.ref(`zenvo_userchats/${chatPeer.uid}/${myUid}`).set({ name: riderName, last: text.slice(0, 60), ts });
  }
  document.getElementById('btn-close-chat').addEventListener('click', closeChat);
  document.getElementById('btn-send-chat').addEventListener('click', sendChat);
  document.getElementById('input-chat-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  document.getElementById('btn-chat-audio').addEventListener('click', () => chatPeer && startCall(chatPeer.uid, 'audio'));
  document.getElementById('btn-chat-video').addEventListener('click', () => chatPeer && startCall(chatPeer.uid, 'video'));

  // ---------- Real audio / video calls (WebRTC, signalling through Firebase) ----------
  const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  let pc = null;
  let localStream = null;
  let callRef = null;
  let callPeerUid = null;
  let callTimeout = null;
  let pendingCall = null;
  let sigRefs = [];

  function watch(ref, ev, fn) { ref.on(ev, fn); sigRefs.push(ref); }

  function showCallUI(name, type, status) {
    document.getElementById('call-target-name').textContent = name;
    document.getElementById('call-status-text').textContent = status;
    document.querySelectorAll('.call-ctrl-btn.off').forEach((b) => b.classList.remove('off'));
    const local = document.getElementById('local-Camera-video');
    local.srcObject = localStream;
    local.style.display = type === 'video' ? 'block' : 'none';
    document.getElementById('call-timer').textContent = '00:00';
    document.getElementById('call-modal').classList.remove('hidden');
  }

  function runCallTimer() {
    clearInterval(callTimerId);
    let secs = 0;
    callTimerId = setInterval(() => {
      secs += 1;
      document.getElementById('call-timer').textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    }, 1000);
  }

  function setupPeer(type) {
    pc = new RTCPeerConnection(RTC_CFG);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    pc.ontrack = (e) => { document.getElementById('remote-video').srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => {
      if (e.candidate && callRef) callRef.child(pc.__isCaller ? 'callerCand' : 'calleeCand').push(e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') { document.getElementById('call-status-text').textContent = 'Connected'; runCallTimer(); clearTimeout(callTimeout); }
      if (pc.connectionState === 'failed') document.getElementById('call-status-text').textContent = 'Connection failed (this network may need a TURN server)';
    };
  }

  async function getMedia(type) {
    if (!window.isSecureContext || !navigator.mediaDevices) { showZenvoModal('🔒 HTTPS REQUIRED', 'Calls need the app to be opened over https (or localhost).'); return false; }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      callStream = localStream;
      return true;
    } catch (err) {
      showZenvoModal('📵 PERMISSION NEEDED', 'Allow microphone' + (type === 'video' ? ' and camera' : '') + ' access to make calls.');
      return false;
    }
  }

  async function startCall(uid, type) {
    if (!cloudReady()) return needCloud('Audio and video calls');
    if (!uid || uid === myUid || pc) return;
    if (!(await getMedia(type))) return;
    const peer = userInfo(uid, 'Rider');
    callPeerUid = uid;
    const callId = 'c_' + Date.now();
    callRef = db.ref('zenvo_callsig/' + callId);
    showCallUI(peer.name, type, 'Calling…');
    setupPeer(type);
    pc.__isCaller = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await callRef.update({ caller: myUid, callerName: riderName, callee: uid, type, offer: { type: offer.type, sdp: offer.sdp }, ts: Date.now() });
    db.ref('zenvo_incoming/' + uid).set({ callId, ts: Date.now() });
    watch(callRef.child('answer'), 'value', async (s) => {
      const a = s.val();
      if (a && pc && !pc.currentRemoteDescription) await pc.setRemoteDescription(a);
    });
    watch(callRef.child('calleeCand'), 'child_added', (s) => { if (pc) pc.addIceCandidate(s.val()).catch(() => {}); });
    watch(callRef.child('ended'), 'value', (s) => { if (s.val()) endCall(false); });
    callTimeout = setTimeout(() => { if (pc && pc.connectionState !== 'connected') { showZenvoModal('📵 NO ANSWER', `${peer.name} did not pick up.`); endCall(true); } }, 40000);
  }

  function endCall(notify) {
    clearTimeout(callTimeout);
    if (callRef && notify) callRef.update({ ended: true });
    sigRefs.forEach((r) => r.off());
    sigRefs = [];
    if (pc) { pc.close(); pc = null; }
    if (callPeerUid && cloudReady()) db.ref('zenvo_incoming/' + callPeerUid).remove();
    callRef = null;
    callPeerUid = null;
    localStream = null;
    document.getElementById('remote-video').srcObject = null;
    stopCall();
  }

  function handleIncoming(snap) {
    const inc = snap.val();
    if (!inc || pc || pendingCall || Date.now() - inc.ts > 45000) return;
    db.ref('zenvo_callsig/' + inc.callId).once('value').then((s) => {
      const d = s.val();
      if (!d || d.ended || pc || pendingCall) return;
      pendingCall = { id: inc.callId, ...d };
      document.getElementById('incoming-caller-name').textContent = d.callerName || 'Rider';
      document.getElementById('incoming-call-type').textContent = d.type === 'video' ? 'Video call' : 'Audio call';
      document.getElementById('incoming-call-modal').classList.remove('hidden');
      if (navigator.vibrate) navigator.vibrate([300, 200, 300, 200, 300]);
    });
  }

  async function acceptCall() {
    const c = pendingCall;
    if (!c) return;
    document.getElementById('incoming-call-modal').classList.add('hidden');
    db.ref('zenvo_incoming/' + myUid).remove();
    if (!(await getMedia(c.type))) { db.ref('zenvo_callsig/' + c.id).update({ ended: true }); pendingCall = null; return; }
    callPeerUid = c.caller;
    callRef = db.ref('zenvo_callsig/' + c.id);
    showCallUI(c.callerName || 'Rider', c.type, 'Connecting…');
    setupPeer(c.type);
    pc.__isCaller = false;
    await pc.setRemoteDescription(c.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await callRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
    watch(callRef.child('callerCand'), 'child_added', (s) => { if (pc) pc.addIceCandidate(s.val()).catch(() => {}); });
    watch(callRef.child('ended'), 'value', (s) => { if (s.val()) endCall(false); });
    pendingCall = null;
  }

  function declineCall() {
    if (pendingCall) db.ref('zenvo_callsig/' + pendingCall.id).update({ ended: true });
    db.ref('zenvo_incoming/' + myUid).remove();
    pendingCall = null;
    document.getElementById('incoming-call-modal').classList.add('hidden');
  }
  document.getElementById('btn-accept-call').addEventListener('click', acceptCall);
  document.getElementById('btn-decline-call').addEventListener('click', declineCall);

  // ---------- Start everything ----------
  bindCallButtons();
  renderAvatar();
  renderSocialFeed();
  renderPeople();
  if (cloudReady()) {
    registerUser();
    db.ref('zenvo_users').on('value', (s) => { cloudUsers = s.val() || {}; renderPeople(); renderSocialFeed(); });
    db.ref('zenvo_posts').orderByChild('ts').limitToLast(30).on('value', (s) => {
      const arr = [];
      s.forEach((child) => { arr.push({ id: child.key, likedBy: {}, comments: {}, ...child.val() }); });
      posts = arr.reverse();
      renderSocialFeed();
      if (openPostId) renderComments();
    });
    db.ref('zenvo_userchats/' + myUid).on('value', (s) => { inbox = s.val() || {}; renderPeople(); });
    db.ref('zenvo_incoming/' + myUid).on('value', handleIncoming);
  }

  updateRadarBanner();

  const tabButtons = document.querySelectorAll('.tab-item');
  const tabScreens = document.querySelectorAll('.tab-screen');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      tabButtons.forEach(b => b.classList.remove('active'));
      tabScreens.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tab-radar') {
        setTimeout(() => map.invalidateSize(), 100);
      }
    });
  });
});