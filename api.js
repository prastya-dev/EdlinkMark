// api.js — Edlink Client API & Storage Helpers
(function(global){
  'use strict';

  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  var BASE  = LOCAL ? 'https://kuliah.unsia.ac.id/api/v1.4' : '/api/v1.4';
  var APP_ID = '031068';
  var KEY   = 'edlink_apikey';
  var CRED  = 'edlink_creds';
  var LIKES_KEY = 'edlink_user_likes';
  var COMMENTS_KEY = 'edlink_user_commented';
  var USER_KEY = 'edlink_user_profile';
  var WINDOW = 14 * 24 * 60 * 60 * 1000;

  var TYPES = {
    M:'Materi', Q:'Tugas Individu', '1':'Tugas Kelompok', Z:'Kuis',
    I:'Pengumuman', V:'Video', H:'Video Interaktif', '2':'Ujian CBT',
    S:'Polling', E:'Acara'
  };

  var IS_ANDROID = /android/i.test(navigator.userAgent);
  var ANDROID_APP = 'id.co.sevima.edlink';

  var token = localStorage.getItem(KEY) || '';
  token = String(token).replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();

  function getLocalLikes(){
    try{ return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}'); }catch(e){ return {}; }
  }
  function setLocalLike(id, val){
    try{
      var m = getLocalLikes();
      if(val) m[id] = true; else delete m[id];
      localStorage.setItem(LIKES_KEY, JSON.stringify(m));
    }catch(e){}
  }
  function isLiked(p){
    if(!p) return false;
    var m = getLocalLikes();
    if(m[p.id] !== undefined) return !!m[p.id];
    return !!p.like;
  }

  function getLocalCommented(){
    try{ return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); }catch(e){ return {}; }
  }
  function setLocalCommented(id, val){
    try{
      var m = getLocalCommented();
      if(val === false) delete m[id]; else m[id] = true;
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(m));
    }catch(e){}
  }
  function isCommented(p, state){
    if(!p) return false;
    if(p.isCommentedByMe) return true;
    var cached = state && state.commentCache && state.commentCache[p.id];
    if(cached && cached.some(function(c){ return isMyComment(c, state); })) return true;
    var m = getLocalCommented();
    return !!m[p.id];
  }

  function isMyComment(c, state){
    if(!c) return false;
    if(c.isMe) return true;
    var user = (state && state.user) || (function(){
      try{ return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); }catch(e){ return {}; }
    })();
    var myId = user.id || user.userId;
    var myUid = user.activeUniversityUserId || user.universityUserId || (user.universityUser && user.universityUser.id);
    var myName = String(user.name || user.fullname || (user.universityUser && user.universityUser.name) || '').toLowerCase().trim();
    var myNim = String(user.identity_number || user.identityNumber || user.nim || user.username || (user.universityUser && user.universityUser.identity_number) || localStorage.getItem('edlink_last') || '').toLowerCase().trim();

    var cUser = c.user || {};
    var cUniv = c.universityUser || (cUser.activeAccount || {});
    var cId = c.userId || cUser.id;
    var cUnivId = c.universityUserId || cUniv.id || cUniv.user_id;
    var cName = String(cUser.name || cUser.fullname || cUniv.name || '').toLowerCase().trim();
    var content = String(c.content || c.comment || c.text || '').toLowerCase();

    if(myId && cId && String(myId) === String(cId)) return true;
    if(myUid && cUnivId && String(myUid) === String(cUnivId)) return true;
    if(myName && cName && (myName === cName || cName.includes(myName) || myName.includes(cName))) return true;
    if(myNim && myNim.length >= 6 && (cName.includes(myNim) || content.includes(myNim))) return true;
    return false;
  }

  function fmtDate(ms){
    if(!ms) return '';
    var d = new Date(ms);
    return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
  }
  function fmtDateTime(ms){
    if(!ms) return '';
    var d = new Date(ms);
    return d.toLocaleString('id-ID', {
      day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }
  function toTime(v){
    if(v == null || v === '') return 0;
    if(typeof v === 'string' && !/^\d+$/.test(v)) v = Date.parse(v);
    var n = Number(v) || 0;
    if(n && n < 1e12) n *= 1000;
    var y = n ? new Date(n).getFullYear() : 0;
    return (y >= 2000 && y <= 2100) ? n : 0;
  }
  function quizDone(q){
    return !!q && (q.isAnsweredAll === true || !!q.submittedAt ||
      ['submitted','finished','graded','done'].indexOf(String(q.takenStatus||'').toLowerCase()) >= 0);
  }
  function quizDue(q){
    if(!q) return 0;
    return toTime(q.finishedAtTimestamp) || toTime(q.finishedAt) ||
           toTime(q.deadlineTimestamp) || toTime(q.deadline);
  }
  function taskDone(t){
    return !!t && (t.isAnswered === true || t.isGraded === true || !!t.submittedAt || Number(t.answererCount) > 0);
  }
  function taskDeadline(p){
    var t = p && p.teacherQuestion;
    return t ? (toTime(t.dueDateTimestamp) || toTime(t.dueDate)) : 0;
  }
  function postLink(p){
    var gid = p.groupId || (p.group && p.group.id);
    var link = 'https://kuliah.unsia.ac.id/panel/classes/' + gid + '/sections';
    if(p.section && p.section.id) link += '/' + p.section.id + '/' + p.id;
    return link;
  }
  function fmtSize(n){
    n = Number(n)||0;
    if(n >= 1048576) return (n/1048576).toFixed(1) + ' MB';
    if(n >= 1024) return Math.round(n/1024) + ' KB';
    return n ? n + ' B' : '';
  }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function edlinkLink(url){
    if(!IS_ANDROID) return url;
    return 'intent://' + url.replace(/^https?:\/\//, '') +
      '#Intent;scheme=https;package=' + ANDROID_APP +
      ';S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
  }
  function sanitize(html){
    var box = document.createElement('div');
    box.innerHTML = html || '';
    box.querySelectorAll('script,style,iframe,object,embed,form').forEach(function(el){ el.remove(); });
    box.querySelectorAll('*').forEach(function(el){
      Array.prototype.slice.call(el.attributes).forEach(function(a){
        if(/^on/i.test(a.name)) el.removeAttribute(a.name);
        if(a.name === 'href' && /^\s*javascript:/i.test(a.value)) el.removeAttribute('href');
      });
      if(el.tagName === 'A'){ el.target = '_blank'; el.rel = 'noopener'; }
      if(el.tagName === 'IMG'){ el.loading = 'lazy'; }
    });
    return box.innerHTML;
  }

  async function silentRelogin(){
    var creds = getCreds();
    if(!creds) return false;
    try{
      var res = await login(creds.u, creds.p);
      var tok = (res.data && res.data.userToken && res.data.userToken.token) || findToken(res.data);
      if(res.applicationSystem && res.applicationSystem.code === 0 && tok){
        token = tok;
        localStorage.setItem(KEY, tok);
        return true;
      }
    }catch(e){}
    return false;
  }

  async function api(path, body, noAuth, extra){
    token = localStorage.getItem(KEY) || token;
    var cleanToken = String(token || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
    var headers = {
      'Accept':'application/json',
      'Content-Type':'application/json',
      'X-App-Locale':'id',
      'X-Referer':'https://kuliah.unsia.ac.id/'
    };
    if(extra) Object.keys(extra).forEach(function(k){ headers[k] = extra[k]; });
    if(!noAuth && cleanToken) headers['Authorization'] = 'Bearer ' + cleanToken;

    var primaryUrl = BASE + path;
    var fallbackUrl = (BASE === '/api/v1.4' ? 'https://kuliah.unsia.ac.id/api/v1.4' : '/api/v1.4') + path;
    var res;
    try{
      res = await fetch(primaryUrl, {
        method:'POST', headers: headers, body: JSON.stringify(body || {})
      });
      if(!res.ok && res.status === 404 && primaryUrl.startsWith('/api')){
        throw new Error('Fallback needed');
      }
    }catch(err){
      try{
        res = await fetch(fallbackUrl, {
          method:'POST', headers: headers, body: JSON.stringify(body || {})
        });
      }catch(err2){
        throw { network:true, message:'Tidak bisa terhubung ke server.' };
      }
    }

    var json;
    try{ json = await res.json(); }
    catch(err){ throw { network:true, message:'Respons server tidak dikenali.' }; }

    var code = json && json.applicationSystem ? json.applicationSystem.code : null;
    if(code === 2 && !noAuth){
      var ok = await silentRelogin();
      if(ok){
        return api(path, body, noAuth, extra);
      }
      throw { auth:true, message:'Sesi berakhir, silakan masuk lagi.' };
    }
    return json;
  }

  function getCreds(){
    try{
      var raw = localStorage.getItem(CRED);
      if(!raw) return null;
      var o = JSON.parse(atob(raw));
      return (o && o.u && o.p) ? o : null;
    }catch(e){ return null; }
  }
  function setCreds(u, p){
    try{ localStorage.setItem(CRED, btoa(JSON.stringify({ u:u, p:p }))); }catch(e){}
  }
  function clearCreds(){
    try{ localStorage.removeItem(CRED); }catch(e){}
  }

  function login(uname, pass){
    var device = JSON.stringify({
      secureId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      name:'Chrome', manufacture:'Google', model:'Chrome', product:'Chrome',
      hardware:'Linux', version:(navigator.userAgent.match(/Chrome\/([\d.]+)/)||[])[1]||'',
      regId:null
    });
    return api('/site/login', {
      username: uname, app_id: APP_ID, email:'', password: pass,
      web_reg_id: null, device: device
    }, true);
  }

  function findToken(obj, depth){
    depth = depth || 0;
    if(!obj || typeof obj !== 'object' || depth > 3) return null;
    if(typeof obj.token === 'string' && obj.token.length >= 20) return obj.token;
    var keys = ['userToken','member','user','account'];
    for(var i = 0; i < keys.length; i++){
      var t = findToken(obj[keys[i]], depth + 1);
      if(t) return t;
    }
    return null;
  }

  async function downloadFile(url, name, btn){
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Mengunduh…';
    try{
      var r = await fetch(url);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var blob = await r.blob();
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name || 'berkas';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
      btn.textContent = 'Terunduh';
    }catch(e){
      window.open(url, '_blank', 'noopener');
      btn.textContent = old;
    }
    btn.disabled = false;
    setTimeout(function(){ btn.textContent = old; }, 2500);
  }

  function mediaUrl(m){
    var f = (m.file && m.file.link) || '';
    var l = m.link || '';
    if(/^(youtube|gdrive|drive|link)$/i.test(String(m.type || ''))) return l || f;
    return f || l;
  }
  function mediaExt(m, url){
    var f = m.file || {};
    var e = String(m.extension || f.extension || '').toLowerCase().replace(/^\./, '');
    if(!e){
      var mime = String(m.mime || f.mime || '').toLowerCase();
      var sub = mime.split('/')[1] || '';
      if(/^application\/pdf/.test(mime)) e = 'pdf';
      else if(/^(image|video|audio)\//.test(mime)){
        if(sub === 'jpeg') sub = 'jpg';
        else if(sub === 'quicktime') sub = 'mov';
        else if(sub === 'mpeg') sub = mime.indexOf('audio/') === 0 ? 'mp3' : 'mp4';
        else if(sub === 'x-msvideo') sub = 'avi';
        e = sub.replace(/^x-/, '').replace(/\+.*$/, '');
      }
    }
    if(!e){
      var found = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
      e = found ? found[1].toLowerCase() : '';
    }
    return e;
  }

  async function fetchCommentsForPost(postId, state){
    if(state && state.commentCache && Array.isArray(state.commentCache[postId])){
      return state.commentCache[postId];
    }
    var res;
    var tries = [
      function(){ return api('/comment/post/' + postId, { dataProvider: JSON.stringify({ page: { current: 1, limit: 200 } }) }); },
      function(){ return api('/comment/post/' + postId, {}); },
      function(){ return api('/comment/post/' + postId + '/', {}); }
    ];
    for(var i = 0; i < tries.length; i++){
      try{
        var r = await tries[i]();
        if(r && r.data && (!r.applicationSystem || r.applicationSystem.code === 0)){
          res = r;
          break;
        }
      }catch(err){
        if(i === tries.length - 1) throw err;
      }
    }
    var d = res && res.data;
    var list = [];
    if(d){
      if(Array.isArray(d)) list = d;
      else if(Array.isArray(d.data)) list = d.data;
      else if(Array.isArray(d.comments)) list = d.comments;
    }
    if(state && state.commentCache){
      state.commentCache[postId] = list;
    }
    return list;
  }

  // Export to global scope
  global.Edlink = {
    LOCAL: LOCAL,
    BASE: BASE,
    KEY: KEY,
    CRED: CRED,
    USER_KEY: USER_KEY,
    WINDOW: WINDOW,
    TYPES: TYPES,
    IS_ANDROID: IS_ANDROID,
    getToken: function(){ return token; },
    setToken: function(t){
      token = String(t || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
      if(token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
    },
    api: api,
    login: login,
    findToken: findToken,
    getCreds: getCreds,
    setCreds: setCreds,
    clearCreds: clearCreds,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    toTime: toTime,
    quizDone: quizDone,
    quizDue: quizDue,
    taskDone: taskDone,
    taskDeadline: taskDeadline,
    postLink: postLink,
    fmtSize: fmtSize,
    esc: esc,
    edlinkLink: edlinkLink,
    sanitize: sanitize,
    downloadFile: downloadFile,
    mediaUrl: mediaUrl,
    mediaExt: mediaExt,
    isLiked: isLiked,
    setLocalLike: setLocalLike,
    isCommented: isCommented,
    setLocalCommented: setLocalCommented,
    isMyComment: isMyComment,
    fetchCommentsForPost: fetchCommentsForPost
  };
})(window);
