// app.js — Main Application UI & Logic
(function(){
  'use strict';

  var E = window.Edlink;
  var $ = function(id){ return document.getElementById(id); };

  var state = {
    posts: [],
    groups: [],
    quizzes: [],
    user: (function(){
      try{ return JSON.parse(localStorage.getItem(E.USER_KEY) || 'null'); }catch(e){ return null; }
    })(),
    groupSel: null,
    postTotals: {},
    likeTab: 'unliked',
    railScroll: 0,
    view: 'posts',
    commentCache: {},
    folder: { cat: 'materi', q: '', loaded: false, items: [] }
  };

  /* ---------------- viewer & modals ---------------- */
  var viewSeq = 0, viewBlob = '';
  function ytId(url){
    var m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
    return m ? m[1] : '';
  }
  function driveId(url){
    var m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/);
    return m ? m[1] : '';
  }
  function hasExt(url, ext){
    return new RegExp('\\.' + ext.replace(/[^a-z0-9]/g, '') + '$', 'i').test(url.split(/[?#]/)[0]);
  }

  function openViewer(m){
    var url = E.mediaUrl(m);
    if(!url){ toast('Berkas ini tidak punya tautan.'); return; }

    var ext  = E.mediaExt(m, url);
    var yt   = ytId(url);
    var gd   = driveId(url);
    var body = $('viewerBody');
    body.textContent = '';
    $('viewerName').textContent = m.name || 'Berkas';

    var el = null, src = url, blobable = false;
    if(yt){
      el = document.createElement('iframe');
      el.src = 'https://www.youtube.com/embed/' + yt + '?rel=0';
      el.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      el.allowFullscreen = true;
      el.title = m.name || 'Video';
    }else if(gd){
      el = document.createElement('iframe');
      el.src = 'https://drive.google.com/file/d/' + gd + '/preview';
      el.title = m.name || 'Video';
    }else if(/^(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(ext)){
      el = document.createElement('img'); el.alt = m.name || ''; blobable = true;
    }else if(ext === 'pdf'){
      el = document.createElement('iframe');
      el.title = m.name || 'PDF';
      if(E.IS_ANDROID) src = 'https://docs.google.com/gview?embedded=true&url=' + encodeURIComponent(url);
      else blobable = true;
    }else if(/^(mp4|webm|ogv|mov|m4v)$/.test(ext)){
      el = document.createElement('video'); el.controls = true; el.playsInline = true; blobable = true;
    }else if(/^(mp3|wav|m4a|aac|oga|ogg)$/.test(ext)){
      el = document.createElement('audio'); el.controls = true; blobable = true;
    }else if(/^(docx?|pptx?|xlsx?|odt|ods|odp|rtf)$/.test(ext)){
      el = document.createElement('iframe');
      src = 'https://docs.google.com/gview?embedded=true&url=' + encodeURIComponent(url);
      el.title = m.name || 'Dokumen';
    }

    var seq = ++viewSeq;
    if(viewBlob){ URL.revokeObjectURL(viewBlob); viewBlob = ''; }

    if(el){
      body.appendChild(el);
      if(blobable && !hasExt(url, ext)){
        fetch(url).then(function(r){
          if(!r.ok) throw new Error('HTTP ' + r.status);
          return r.blob();
        }).then(function(b){
          if(seq !== viewSeq) return;
          viewBlob = URL.createObjectURL(new Blob([b], { type: m.mime || 'application/octet-stream' }));
          el.src = viewBlob;
        }).catch(function(){
          if(seq === viewSeq) el.src = url;
        });
      }else{
        el.src = src;
      }
    }else{
      var p = document.createElement('p');
      p.className = 'nopreview';
      p.textContent = 'Pratinjau tidak tersedia untuk format ini. Buka di tab baru atau unduh berkasnya.';
      body.appendChild(p);
    }

    $('viewerOpen').href = url;
    $('viewerDl').onclick = function(){ E.downloadFile(url, m.name, this); };
    $('viewer').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeViewer(){
    viewSeq++;
    $('viewerBody').textContent = '';
    if(viewBlob){ URL.revokeObjectURL(viewBlob); viewBlob = ''; }
    $('viewer').hidden = true;
    document.body.style.overflow = $('postModal').hidden ? '' : 'hidden';
  }

  function openPost(p){
    var box = $('pmBody');
    box.textContent = '';
    $('pmTitle').textContent = (p.group && p.group.name) || 'Detail postingan';
    box.appendChild(postCard(p));
    $('postModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePost(){
    $('pmBody').textContent = '';
    $('postModal').hidden = true;
    document.body.style.overflow = $('viewer').hidden ? '' : 'hidden';
  }

  var toastTimer = null;
  function toast(msg){
    var old = document.querySelector('.toast');
    if(old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.remove(); }, 3000);
  }

  /* ---------------- rendering components ---------------- */

  function renderApp(user){
    $('login').hidden = true;
    $('app').hidden = false;
    $('whoName').textContent = (user && (user.name || user.fullname || user.email)) || '';
    var nim = (user && (user.identity_number || user.identityNumber || user.nim || user.username || (user.university && user.university.identity_number))) || localStorage.getItem('edlink_last') || '';
    $('whoNim').textContent = nim;
    $('copyNim').hidden = !nim;
    $('userCard').hidden = !user;
  }

  function showLogin(msg){
    $('app').hidden = true;
    $('login').hidden = false;
    $('checking').hidden = true;
    $('loginForm').hidden = false;
    $('loginErr').innerHTML = msg ? '<p class="err">' + E.esc(msg) + '</p>' : '';
    var last = localStorage.getItem('edlink_last');
    if(last && !$('nim').value) $('nim').value = last;
    $('whoName').textContent = '';
    $('whoNim').textContent = '';
    if($('userCard')) $('userCard').hidden = true;
  }

  function showChecking(){
    $('app').hidden = true;
    $('login').hidden = false;
    $('loginForm').hidden = true;
    $('checking').hidden = false;
  }

  function showRetry(msg){
    $('app').hidden = true;
    $('login').hidden = false;
    $('checking').hidden = true;
    $('loginForm').hidden = false;
    $('loginErr').innerHTML = '<div class="retry"><p>' + E.esc(msg || 'Gagal terhubung ke server.') + '</p></div>';
    var btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.type = 'button';
    btn.textContent = 'Coba lagi';
    btn.addEventListener('click', function(){ btn.disabled = true; boot(); });
    $('loginErr').firstChild.appendChild(btn);
  }

  function fileRow(m){
    var url = E.mediaUrl(m);
    var row = document.createElement('div');
    row.className = 'file';
    var main = document.createElement('div');
    main.className = 'fmain';
    var nm = document.createElement('div'); nm.className = 'fname'; nm.textContent = m.name || 'Berkas';
    var mt = document.createElement('div'); mt.className = 'fmeta';
    mt.textContent = [ (m.extension||'').toUpperCase(), E.fmtSize(m.size) ].filter(Boolean).join(' · ');
    main.appendChild(nm); main.appendChild(mt);
    var acts = document.createElement('div');
    acts.className = 'facts';
    var view = document.createElement('button');
    view.className = 'dl'; view.type = 'button'; view.textContent = 'Lihat';
    view.addEventListener('click', function(){ openViewer(m); });
    var btn = document.createElement('button');
    btn.className = 'dl'; btn.type = 'button'; btn.textContent = 'Unduh';
    btn.addEventListener('click', function(){ E.downloadFile(url, m.name, btn); });
    acts.appendChild(view); acts.appendChild(btn);
    row.appendChild(main); row.appendChild(acts);
    return row;
  }

  function svgHeart(liked){
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" style="vertical-align:middle;flex-shrink:0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  }
  function svgComment(active){
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (active ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" style="vertical-align:middle;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  }
  function updateLikeBtn(b, liked, count){
    b.className = 'btn-action btn-like' + (liked ? ' active' : '');
    b.innerHTML = svgHeart(liked) + ' ' + (liked ? 'Disukai' : 'Suka') + (count ? ' (' + count + ')' : '');
  }
  function updateCommentBtn(b, active, count){
    b.className = 'btn-action btn-comment' + (active ? ' active' : '');
    b.innerHTML = svgComment(active) + ' ' + (count || 0) + ' Komentar';
  }
  function postCard(p, likedBadge){
    var el = document.createElement('article');
    el.className = 'post';
    el.setAttribute('data-pid', p.id);

    var type = E.TYPES[String(p.type)] || 'Postingan';
    var meets = p.section && p.section.meet ? 'Pertemuan ' + p.section.meet : '';
    var author = (p.universityUser && p.universityUser.name) || (p.user && p.user.name) || '';

    var head = document.createElement('div');
    head.className = 'phead';
    head.innerHTML = '<span class="badge">' + E.esc(type) + '</span>' +
      (meets ? '<span>' + E.esc(meets) + '</span>' : '') +
      '<span>' + E.esc(E.fmtDate(p.createdAt)) + '</span>';

    var dl = E.taskDeadline(p);
    if(dl){
      var dlEl = document.createElement('span');
      dlEl.className = E.taskDone(p.teacherQuestion) ? '' : 'deadline';
      dlEl.textContent = (E.taskDone(p.teacherQuestion) ? 'Batas: ' : 'Tenggat ') + E.fmtDateTime(dl);
      head.appendChild(dlEl);
    }
    if(String(p.type) === 'Z'){
      var qdl = E.quizDue(p.quiz);
      if(qdl){
        var qdlEl = document.createElement('span');
        qdlEl.className = E.quizDone(p.quiz) ? '' : 'deadline';
        qdlEl.textContent = (E.quizDone(p.quiz) ? 'Batas: ' : 'Belum dikerjakan · batas ') + E.fmtDateTime(qdl);
        head.appendChild(qdlEl);
      }
    }
    if(likedBadge){
      var lk = document.createElement('span');
      lk.className = 'likedtag';
      lk.textContent = 'Liked';
      head.appendChild(lk);
    }

    var h = document.createElement('h4');
    h.textContent = p.title || '(tanpa judul)';

    el.appendChild(head);
    el.appendChild(h);

    if(p.description){
      var d = document.createElement('div');
      d.className = 'desc';
      d.innerHTML = E.sanitize(p.description);
      el.appendChild(d);
    }

    var medias = (p.medias || []).filter(function(m){ return E.mediaUrl(m); });
    if(medias.length){
      var wrap = document.createElement('div');
      wrap.className = 'files';
      medias.forEach(function(m){ wrap.appendChild(fileRow(m)); });
      el.appendChild(wrap);
    }

    var foot = document.createElement('div');
    foot.className = 'pfoot';

    var likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    var count = p.likesCount !== undefined ? p.likesCount : (p.likeCount || 0);
    updateLikeBtn(likeBtn, E.isLiked(p), count);
    likeBtn.addEventListener('click', function(e){
      e.stopPropagation();
      toggleLike(p, likeBtn);
    });
    foot.appendChild(likeBtn);

    var commentBtn = document.createElement('button');
    commentBtn.type = 'button';
    var cCount = E.getCommentCount(p);
    p.commentCount = cCount;
    updateCommentBtn(commentBtn, E.isCommented(p, state), cCount);
    commentBtn.addEventListener('click', function(e){
      e.stopPropagation();
      toggleComments(p, el, commentBtn);
    });
    foot.appendChild(commentBtn);

    if(author){
      var au = document.createElement('span');
      au.className = 'pauthor';
      au.textContent = author;
      foot.appendChild(au);
    }

    el.appendChild(foot);
    return el;
  }

  async function toggleLike(p, btn){
    var next = !E.isLiked(p);
    var curCount = p.likesCount !== undefined ? p.likesCount : (p.likeCount || 0);
    var newCount = Math.max(0, curCount + (next ? 1 : -1));

    p.like = next;
    E.setLocalLike(p.id, next);
    p.likesCount = newCount;
    p.likeCount = newCount;

    document.querySelectorAll('[data-pid="' + p.id + '"] .btn-like').forEach(function(b){
      updateLikeBtn(b, next, newCount);
    });
    if(btn){
      updateLikeBtn(btn, next, newCount);
    }

    try{
      await E.collectAction({
        category: 'post',
        action: next ? 'like_post' : 'unlike_post',
        reference_id: p.id,
        u_type: 'u',
        u_id: null,
        value: null
      }, p.groupId || (p.group && p.group.id));

      E.api('/tracker', {
        action: (next ? 'like' : 'unlike') + ' Bahan Ajar',
        result: 1
      }).catch(function(){});
    }catch(err){
      console.error('Like sync error:', err);
      p.like = !next;
      E.setLocalLike(p.id, !next);
      p.likesCount = curCount;
      p.likeCount = curCount;
      document.querySelectorAll('[data-pid="' + p.id + '"] .btn-like').forEach(function(b){
        updateLikeBtn(b, !next, curCount);
      });
      if(btn) updateLikeBtn(btn, !next, curCount);
      var msg = (err && (err.message || (err.applicationSystem && err.applicationSystem.message))) || 'Gagal menyinkronkan suka ke server.';
      toast(msg);
      return;
    }

    var likedN = state.posts.filter(E.isLiked).length;
    var cUn = $('tabCount_unliked');
    var cAll = $('tabCount_all');
    var cLk = $('tabCount_liked');
    if(cUn) cUn.textContent = state.posts.length - likedN;
    if(cAll) cAll.textContent = state.posts.length;
    if(cLk) cLk.textContent = likedN;

    if(state.likeTab === 'unliked' && next){
      document.querySelectorAll('[data-pid="' + p.id + '"]').forEach(function(el){ el.remove(); });
    }else if(state.likeTab === 'liked' && !next){
      document.querySelectorAll('[data-pid="' + p.id + '"]').forEach(function(el){ el.remove(); });
    }
  }

  function commentItem(c){
    var item = document.createElement('div');
    item.className = 'citem' + (E.isMyComment(c, state) ? ' me' : '');
    var u = c.user || c.universityUser || {};
    var name = u.name || u.fullname || 'Pengguna';
    var text = c.content || c.comment || c.text || c.description || '';
    var time = E.fmtDateTime(c.createdAt || c.created_at || c.createdAtTimestamp || Date.now());

    var head = document.createElement('div');
    head.className = 'chead';
    head.innerHTML = '<span class="cauthor">' + E.esc(name) + '</span><span class="ctime">' + E.esc(time) + '</span>';
    var body = document.createElement('div');
    body.className = 'cbody';
    body.textContent = text;

    item.appendChild(head);
    item.appendChild(body);
    return item;
  }

  function renderCommentList(p, wrap, list, commentBtn, postEl){
    wrap.innerHTML = '';
    var hasMe = list.some(function(c){ return E.isMyComment(c, state); });
    var count = Math.max(list.length, E.getCommentCount(p));
    p.commentCount = count;
    if(hasMe){
      p.isCommentedByMe = true;
      E.setLocalCommented(p.id, true);
    }
    var active = hasMe || E.isCommented(p, state);
    document.querySelectorAll('[data-pid="' + p.id + '"] .btn-comment').forEach(function(cb){
      updateCommentBtn(cb, active, count);
    });
    if(commentBtn) updateCommentBtn(commentBtn, active, count);

    var listEl = document.createElement('div');
    listEl.className = 'comments-list';
    if(!list.length){
      var empty = document.createElement('div');
      empty.className = 'cnone';
      empty.textContent = 'Belum ada komentar.';
      listEl.appendChild(empty);
    }else{
      var sorted = list.slice().sort(function(a, b){
        var aMe = E.isMyComment(a, state) ? 1 : 0;
        var bMe = E.isMyComment(b, state) ? 1 : 0;
        if(aMe !== bMe) return bMe - aMe;
        var aTime = E.toTime(a.createdAt || a.created_at || a.createdAtTimestamp) || 0;
        var bTime = E.toTime(b.createdAt || b.created_at || b.createdAtTimestamp) || 0;
        return bTime - aTime;
      });
      sorted.forEach(function(c){ listEl.appendChild(commentItem(c)); });
    }
    wrap.appendChild(listEl);

    var form = document.createElement('form');
    form.className = 'cform';
    var inp = document.createElement('input');
    inp.className = 'cinput';
    inp.type = 'text';
    inp.placeholder = 'Tulis komentar…';
    inp.maxLength = 500;
    var sub = document.createElement('button');
    sub.className = 'csubmit';
    sub.type = 'submit';
    sub.textContent = 'Kirim';
    form.appendChild(inp);
    form.appendChild(sub);

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      var txt = inp.value.trim();
      if(!txt) return;
      sub.disabled = true;
      sub.textContent = '…';
      try{
        var sendRes = await E.api('/comment/create/' + p.id, {
          content: txt,
          comment: txt,
          mention_users: null
        });
        var rawList = sendRes && sendRes.data && (sendRes.data.data || sendRes.data.comments || (Array.isArray(sendRes.data) ? sendRes.data : null));
        var created = (rawList && rawList[0]) || (sendRes && sendRes.data && sendRes.data.comment) || {
          content: txt,
          user: state.user || { name: 'Saya' },
          createdAt: Date.now()
        };
        created.isMe = true;
        if(!created.content && created.comment) created.content = created.comment;
        if(!created.user) created.user = state.user || { name: 'Saya' };

        if(!state.commentCache[p.id]) state.commentCache[p.id] = [];
        state.commentCache[p.id].unshift(created);

        p.commentCount = (p.commentCount || 0) + 1;
        p.isCommentedByMe = true;
        E.setLocalCommented(p.id, true);

        document.querySelectorAll('[data-pid="' + p.id + '"] .btn-comment').forEach(function(cb){
          updateCommentBtn(cb, true, p.commentCount);
        });
        if(commentBtn){
          updateCommentBtn(commentBtn, true, p.commentCount);
        }

        renderCommentList(p, wrap, state.commentCache[p.id], commentBtn, postEl);
        var freshList = wrap.querySelector('.comments-list');
        if(freshList) freshList.scrollTop = 0;
      }catch(err){
        toast('Gagal mengirim komentar.');
        sub.disabled = false;
        sub.textContent = 'Kirim';
      }
    });
    wrap.appendChild(form);
  }

  async function toggleComments(p, postEl, commentBtn){
    var wrap = postEl.querySelector('.comments-wrap');
    if(wrap){
      if(!wrap.querySelector('.cloading') && !wrap.querySelector('.cerr')){
        wrap.hidden = !wrap.hidden;
        return;
      }
      wrap.remove();
    }

    wrap = document.createElement('div');
    wrap.className = 'comments-wrap';
    postEl.appendChild(wrap);

    if(state.commentCache[p.id] && Array.isArray(state.commentCache[p.id])){
      renderCommentList(p, wrap, state.commentCache[p.id], commentBtn, postEl);
      return;
    }

    wrap.innerHTML = '<div class="cloading">Memuat komentar…</div>';

    try{
      var list = await E.fetchCommentsForPost(p.id, state);
      renderCommentList(p, wrap, list, commentBtn, postEl);
    }catch(err){
      wrap.innerHTML = '<div class="cerr">Gagal memuat komentar otomatis.</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px">' +
        '  <button type="button" class="btn-action btn-retry">Coba lagi</button>' +
        '  <a href="' + E.esc(E.postLink(p)) + '" target="_blank" rel="noopener" class="btn-action" style="color:var(--ink);text-decoration:none">Buka Diskusi di Web EdLink ↗</a>' +
        '  <button type="button" class="btn-action btn-mark-manual">' + (E.isCommented(p, state) ? 'Batalkan Tanda Sudah Komentar' : 'Tandai Sudah Komentar ✓') + '</button>' +
        '</div>';

      var retry = wrap.querySelector('.btn-retry');
      if(retry){
        retry.addEventListener('click', function(ev){
          ev.stopPropagation();
          wrap.remove();
          delete state.commentCache[p.id];
          toggleComments(p, postEl, commentBtn);
        });
      }
      var markBtn = wrap.querySelector('.btn-mark-manual');
      if(markBtn){
        markBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          var nextState = !E.isCommented(p, state);
          p.isCommentedByMe = nextState;
          E.setLocalCommented(p.id, nextState);
          document.querySelectorAll('[data-pid="' + p.id + '"] .btn-comment').forEach(function(cb){
            updateCommentBtn(cb, nextState, p.commentCount || 0);
          });
          markBtn.textContent = nextState ? 'Batalkan Tanda Sudah Komentar' : 'Tandai Sudah Komentar ✓';
        });
      }

      var form = document.createElement('form');
      form.className = 'cform';
      form.innerHTML = '<input class="cinput" type="text" placeholder="Tulis komentar baru…" maxlength="500"><button class="csubmit" type="submit">Kirim</button>';
      form.addEventListener('submit', async function(ev){
        ev.preventDefault();
        var inp = form.querySelector('.cinput');
        var sub = form.querySelector('.csubmit');
        var txt = (inp.value || '').trim();
        if(!txt) return;
        sub.disabled = true; sub.textContent = '…';
        try{
          await E.api('/comment/create/' + p.id, { content: txt, comment: txt, mention_users: null });
          p.isCommentedByMe = true;
          E.setLocalCommented(p.id, true);
          document.querySelectorAll('[data-pid="' + p.id + '"] .btn-comment').forEach(function(cb){
            updateCommentBtn(cb, true, (p.commentCount || 0) + 1);
          });
          toast('Komentar berhasil dikirim.');
          wrap.remove();
          toggleComments(p, postEl, commentBtn);
        }catch(e){
          toast('Gagal mengirim komentar.');
          sub.disabled = false; sub.textContent = 'Kirim';
        }
      });
      wrap.appendChild(form);
    }
  }

  function renderQuizzes(){
    var box = $('quizList');
    if(!box) return;
    box.textContent = '';
    if(!state.quizzes.length){
      var p = document.createElement('p');
      p.className = 'none';
      p.textContent = 'Tidak ada kuis atau tugas yang belum dikerjakan.';
      box.appendChild(p);
      return;
    }
    state.quizzes.forEach(function(q){
      var isQuiz = !!q.quiz;
      var row = document.createElement('div');
      row.className = 'quiz';

      var main = document.createElement('div');
      main.className = 'qmain';
      var t = document.createElement('div');
      t.className = 'qtitle';
      t.textContent = q.post.title || (isQuiz ? 'Kuis' : 'Tugas');
      var m = document.createElement('div');
      m.className = 'qmeta';
      var bits = [q.group.name];
      if(isQuiz){
        if(q.quiz.questionsCount) bits.push(q.quiz.questionsCount + ' soal');
        if(q.quiz.duration) bits.push(Math.round(Number(q.quiz.duration)/60) + ' menit');
      }else{
        bits.push(E.TYPES[String(q.post.type)] || 'Tugas');
      }
      m.textContent = bits.join(' · ');
      main.appendChild(t); main.appendChild(m);

      var dl = isQuiz ? E.quizDue(q.quiz) : E.taskDeadline(q.post);
      if(dl){
        var d = document.createElement('div');
        d.className = 'qmeta deadline';
        d.textContent = 'Batas: ' + E.fmtDateTime(dl);
        main.appendChild(d);
      }

      var a = document.createElement('a');
      a.href = E.edlinkLink(isQuiz
        ? 'https://kuliah.unsia.ac.id/panel/classes/' + q.group.id + '/quizes'
        : E.postLink(q.post));
      if(!E.IS_ANDROID){ a.target = '_blank'; a.rel = 'noopener'; }
      a.textContent = isQuiz ? 'Kerjakan' : 'Buka';

      row.appendChild(main);
      row.appendChild(a);
      box.appendChild(row);
    });
  }

  function renderPosts(){
    var box = $('posts');
    var oldRail = box.querySelector('.rail');
    if(oldRail) state.railScroll = oldRail.scrollLeft;
    box.textContent = '';

    var likedN = state.posts.filter(E.isLiked).length;
    var tabs = document.createElement('div');
    tabs.className = 'tabs';
    [ { id:'unliked', label:'Belum di-like', n:state.posts.length - likedN },
      { id:'all',     label:'All',            n:state.posts.length },
      { id:'liked',   label:'Sudah di-like',  n:likedN } ].forEach(function(t){
      var tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'tab' + (state.likeTab === t.id ? ' active' : '');
      tb.textContent = t.label;
      var c = document.createElement('span');
      c.className = 'count';
      c.id = 'tabCount_' + t.id;
      c.textContent = t.n;
      tb.appendChild(c);
      tb.addEventListener('click', function(){
        if(state.likeTab === t.id) return;
        state.likeTab = t.id;
        renderPosts();
      });
      tabs.appendChild(tb);
    });
    box.appendChild(tabs);

    var rows = state.posts.filter(function(p){
      if(state.likeTab === 'liked') return E.isLiked(p);
      if(state.likeTab === 'unliked') return !E.isLiked(p);
      return true;
    });

    rows.sort(function(a,b){
      return (b.createdAt||0) - (a.createdAt||0);
    });

    var byGroup = new Map();
    state.groups.forEach(function(g){
      byGroup.set(g.id, { name:g.name, total:state.postTotals[g.id] || 0, items:[] });
    });
    rows.forEach(function(p){
      if(!byGroup.has(p.groupId)){
        byGroup.set(p.groupId, {
          name:p.group.name, total:state.postTotals[p.groupId] || 0, items:[]
        });
      }
      byGroup.get(p.groupId).items.push(p);
    });

    if(!byGroup.size){
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'Belum ada kelas pada periode aktif.';
      box.appendChild(e);
      return;
    }

    function latest(items){
      return items.reduce(function(m,p){ return Math.max(m, p.createdAt||0); }, 0);
    }
    var entries = Array.from(byGroup.entries())
      .sort(function(a,b){
        return (b[1].items.length - a[1].items.length) ||
               (b[1].total - a[1].total) ||
               (latest(b[1].items) - latest(a[1].items));
      });

    paintPosts(box, entries);
  }

  function paintPosts(box, entries){
    var sel = (state.groupSel && entries.find(function(e){ return e[0] === state.groupSel && e[1].items.length > 0; }))
           || (state.groupSel && entries.find(function(e){ return e[0] === state.groupSel; }))
           || entries.find(function(e){ return e[1].items.length > 0; })
           || entries[0];
    state.groupSel = sel[0];

    var rail = document.createElement('div');
    rail.className = 'rail';
    entries.forEach(function(entry){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (entry[0] === state.groupSel ? ' active' : '');
      var nm = document.createElement('span');
      nm.className = 'cname';
      nm.textContent = entry[1].name;
      b.appendChild(nm);
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = entry[1].items.length;
      b.appendChild(n);
      b.addEventListener('click', function(){
        state.groupSel = entry[0];
        renderPosts();
      });
      rail.appendChild(b);
    });

    var list = document.createElement('div');
    list.className = 'plist';
    if(!sel[1].items.length){
      var none = document.createElement('p');
      none.className = 'none';
      none.textContent = 'Belum ada postingan pada rentang ini.';
      list.appendChild(none);
    }

    var frag = document.createDocumentFragment();
    sel[1].items.forEach(function(p){
      frag.appendChild(postCard(p, state.likeTab === 'all' && E.isLiked(p)));
    });
    list.appendChild(frag);

    box.appendChild(rail);
    box.appendChild(list);
    rail.scrollLeft = state.railScroll || 0;
  }

  async function checkCommentedPosts(posts, state){
    if(!posts || !posts.length) return;
    var candidates = posts.filter(function(p){
      if(!p || !p.id) return false;
      if(E.getCommentCount(p) <= 0) return false;
      var m = E.getLocalCommented();
      if(m[p.id] !== undefined) return false;
      return true;
    });
    if(!candidates.length) return;

    var poolSize = 3;
    var queue = candidates.slice();
    async function worker(){
      while(queue.length){
        var p = queue.shift();
        try{
          var list = await E.fetchCommentsForPost(p.id, state);
          var hasMe = list.some(function(c){ return E.isMyComment(c, state); });
          E.setLocalCommented(p.id, hasMe);
          if(hasMe){
            p.isCommentedByMe = true;
            document.querySelectorAll('[data-pid="' + p.id + '"] .btn-comment').forEach(function(cb){
              updateCommentBtn(cb, true, p.commentCount || list.length);
            });
          }
        }catch(e){}
      }
    }
    await Promise.all(Array.from({ length: Math.min(poolSize, candidates.length) }, worker));
  }

  /* ---------------- data loaders ---------------- */

  async function loadAll(){
    $('posts').innerHTML = '<div class="loading">Memuat kelas dan postingan…</div>';

    if(!state.user){
      var profile = await E.api('/user/profile');
      state.user = profile.data;
      if(state.user){
        try{ localStorage.setItem(E.USER_KEY, JSON.stringify(state.user)); }catch(e){}
      }
    }
    renderApp(state.user);

    var periods = await E.api('/university/periods');
    var active = (periods.data || []).find(function(p){ return p.status === 1; });

    var groupsRes = await E.api('/group/all');
    var allGroups = (groupsRes.data && groupsRes.data.data) || [];
    state.groups = active
      ? allGroups.filter(function(g){ return String(g.periode) === String(active.value); })
      : allGroups;

    var cutoff = Date.now() - E.WINDOW;
    var posts = [];
    var quizzes = [];
    var totals = {};

    await Promise.all(state.groups.map(async function(g){
      var res;
      try{ res = await E.api('/post/group/' + g.id); }catch(e){ return; }
      var list = (res.data && res.data.data) || [];
      totals[g.id] = list.length;
      list.forEach(function(p){
        var post = Object.assign({}, p, { group: { id:g.id, name:g.name } });
        if(p.type === 'Z' && p.quiz && !E.quizDone(p.quiz)){
          quizzes.push({ post:post, quiz:p.quiz, group:{ id:g.id, name:g.name } });
        }else if((String(p.type) === 'Q' || String(p.type) === '1') &&
                 p.teacherQuestion && !E.taskDone(p.teacherQuestion)){
          quizzes.push({ post:post, task:p.teacherQuestion, group:{ id:g.id, name:g.name } });
        }
        if(post.likesCount === undefined && post.likeCount !== undefined) post.likesCount = post.likeCount;
        if(p.like !== undefined){
          post.like = !!p.like;
          E.setLocalLike(p.id, !!p.like);
        }else if(E.isLiked(post)){
          post.like = true;
        }
        post.commentCount = E.getCommentCount(p);
        if((p.createdAt || 0) >= cutoff) posts.push(post);
      });
    }));

    quizzes.sort(function(a,b){ return (b.post.createdAt||0) - (a.post.createdAt||0); });
    state.posts = posts;
    state.quizzes = quizzes;
    state.postTotals = totals;
    renderQuizzes();
    renderPosts();
    checkCommentedPosts(state.posts, state);
  }
  async function doLogin(uname, pass){
    var res = await E.login(uname, pass);
    var sys = res.applicationSystem || {};
    var tok = (res.data && res.data.userToken && res.data.userToken.token) || E.findToken(res.data);
    if(sys.code !== 0 || !tok){
      throw new Error(sys.message || 'NIM atau kata sandi salah.');
    }
    E.setToken(tok);
    try{
      localStorage.setItem('edlink_last', uname);
    }catch(e){}
    $('loginErr').innerHTML = '';
    await loadAll();
  }

  async function boot(){
    if(!E.getToken()){ showLogin(''); return; }

    showChecking();
    try{
      var profile = await E.api('/user/profile');
      state.user = profile.data;
      if(state.user){
        try{ localStorage.setItem(E.USER_KEY, JSON.stringify(state.user)); }catch(e){}
      }
      renderApp(state.user);
      await loadAll();
      return;
    }catch(e){
      if(e && e.network){ showRetry(e.message); return; }

      if(!e || !e.auth){
        showRetry('Terjadi kesalahan: ' + ((e && e.message) || e));
        return;
      }

      var creds = E.getCreds();
      if(creds){
        try{
          await doLogin(creds.u, creds.p);
          return;
        }catch(e2){
          if(e2 && e2.network){ showRetry(e2.message); return; }
        }
      }

      E.setToken('');
      showLogin('Sesi berakhir. Silakan masuk lagi.');
    }
  }

  /* ---------------- events ---------------- */

  $('loginForm').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var uname = $('nim').value.trim();
    var pass  = $('pass').value;
    if(!uname || !pass) return;

    var btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Memeriksa…';
    $('loginErr').innerHTML = '';

    try{
      await doLogin(uname, pass);
      if($('remember').checked) E.setCreds(uname, pass);
      else E.clearCreds();
      $('pass').value = '';
    }catch(e){
      var msg = e && e.message ? e.message : 'Gagal masuk.';
      if(e && e.network) msg = 'Tidak bisa terhubung ke server. Pastikan koneksi aktif.';
      $('loginErr').innerHTML = '<p class="err">' + E.esc(msg) + '</p>';
    }
    btn.disabled = false; btn.textContent = 'Masuk';
  });

  $('logout').addEventListener('click', function(){
    try{
      E.setToken('');
      E.clearCreds();
      sessionStorage.removeItem('edlink_transfer_key');
      sessionStorage.removeItem('edlink_files_authorized');
      sessionStorage.removeItem('edlink_active_token');
    }catch(e){}
    state.posts = []; state.quizzes = []; state.user = null;
    $('pass').value = '';
    showLogin('');
  });

  var navFiles = $('navFiles');
  if(navFiles){
    navFiles.addEventListener('click', function(e){
      e.preventDefault();
      var curTok = E.getToken();
      if(!curTok){
        alert('Silakan masuk terlebih dahulu.');
        return;
      }
      sessionStorage.setItem('edlink_transfer_from', 'index.html');
      sessionStorage.setItem('edlink_transfer_time', String(Date.now()));
      sessionStorage.setItem('edlink_transfer_key', curTok);
      location.href = 'files.html';
    });
  }

  var navAnswer = $('navAnswer');
  if(navAnswer){
    navAnswer.addEventListener('click', function(e){
      e.preventDefault();
      var curTok = E.getToken();
      if(!curTok){
        alert('Silakan masuk terlebih dahulu.');
        return;
      }
      sessionStorage.setItem('edlink_transfer_from', 'index.html');
      sessionStorage.setItem('edlink_transfer_time', String(Date.now()));
      sessionStorage.setItem('edlink_transfer_key', curTok);
      location.href = 'answer.html';
    });
  }

  function fallbackCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand('copy');
      toast('NIM disalin ke clipboard');
    }catch(e){
      toast('Gagal menyalin NIM');
    }
    ta.remove();
  }

  var copyNimBtn = $('copyNim');
  if(copyNimBtn){
    copyNimBtn.addEventListener('click', function(){
      var nim = $('whoNim').textContent.trim();
      if(!nim) return;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(nim).then(function(){
          toast('NIM disalin ke clipboard');
        }).catch(function(){
          fallbackCopy(nim);
        });
      }else{
        fallbackCopy(nim);
      }
    });
  }

  $('viewerClose').addEventListener('click', closeViewer);
  $('viewer').addEventListener('click', function(ev){ if(ev.target === $('viewer')) closeViewer(); });
  $('pmClose').addEventListener('click', closePost);
  $('postModal').addEventListener('click', function(ev){ if(ev.target === $('postModal')) closePost(); });
  document.addEventListener('keydown', function(ev){
    if(ev.key !== 'Escape') return;
    if(!$('viewer').hidden) closeViewer();
    else if(!$('postModal').hidden) closePost();
  });

  if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }

  boot();
})();
