/* ============================================================
   Lernspiel KI-Management — Gemeinsame Task-Engine (app.js)
   Wiederverwendbare Komponenten: dragKit (robustes DnD),
   Multiple-Choice, Entscheidungsszenarien, editierbare Tabelle,
   Fortschritt. Kein Build-Schritt, Vanilla JS, Touch-tauglich.
   ============================================================ */

(function(){
  "use strict";

  /* ---------- Fortschritt (localStorage) ---------- */
  const Store = {
    key: "kilearning_progress_v2",
    read(){ try{ return JSON.parse(localStorage.getItem(this.key)) || {}; }catch(e){ return {}; } },
    write(o){ try{ localStorage.setItem(this.key, JSON.stringify(o)); }catch(e){} },
    mark(chapter, taskId){
      const o = this.read();
      o[chapter] = o[chapter] || {done:[]};
      if(!o[chapter].done.includes(taskId)){ o[chapter].done.push(taskId); }
      this.write(o); this.refresh();
    },
    reset(chapter){
      const o = this.read();
      if(chapter){ delete o[chapter]; } else { o = {}; }
      this.write(o); this.refresh();
    },
    refresh(){
      document.querySelectorAll("[data-progress]").forEach(el=>{
        const ch = el.dataset.progress;
        const o = this.read();
        const total = parseInt(el.dataset.total||"0",10);
        const done = (o[ch] && o[ch].done ? o[ch].done.length : 0);
        const pct = total? Math.round(done/total*100) : 0;
        el.style.width = pct + "%";
        const lbl = document.querySelector(`[data-progress-label="${ch}"]`);
        if(lbl) lbl.textContent = done + " / " + total + " Aufgaben";
      });
    }
  };

  /* ---------- Feedback-Helfer ---------- */
  function feedback(el, ok, msg){
    if(!el) return;
    el.classList.remove("ok","no");
    el.classList.add("show", ok?"ok":"no");
    el.innerHTML = `<span class="fb-ico">${ok?"✅":"❌"}</span><span>${msg}</span>`;
  }

  /* ============================================================
     dragKit — robustes, wiederverwendbares Drag & Drop
     opts: {
       poolId,                          // Element, das die Chips enthält
       chips: [{id, text, key}],        // key = korrekte Zone
       zones: [{id, key}],              // ganze Zone-Elemente sind Drop-Ziele
       onAllPlaced: fn                  // optional
     }
     Rückgabe: { check, reset, placed, allPlaced, pool }
     - Ganze Zone ist Drop-Fläche (grosses Trefferfeld)
     - Chips sind JEDERZEIT wieder verschiebbar (auch nach Check)
     - Doppelklick: Chip zurück in den Pool
     ============================================================ */
  function dragKit(opts){
    const pool = document.getElementById(opts.poolId);
    if(!pool) return null;
    const zones = (opts.zones||[])
      .map(z=>({ id:z.id, key:z.key, el:document.getElementById(z.id) }))
      .filter(z=>z.el);
    zones.forEach(z=>z.el.classList.add("dz"));

    (opts.chips||[]).forEach(c=>{
      const el = document.createElement("div");
      el.className = "chip";
      el.dataset.id = c.id;
      el.dataset.key = c.key;
      el.textContent = c.text;
      pool.appendChild(el);
    });

    let dragEl = null, ghost = null;

    function zoneAt(x,y){
      const h = document.elementFromPoint(x,y);
      if(!h) return null;
      const dz = h.closest(".dz");
      return zones.find(z=>z.el===dz) || null;
    }
    function start(e, chip){
      dragEl = chip;
      chip.classList.add("dragging");
      ghost = chip.cloneNode(true);
      ghost.classList.add("dragging");
      ghost.style.cssText = "position:fixed;z-index:1000;pointer-events:none;margin:0;width:"+chip.offsetWidth+"px;left:"+(e.clientX-chip.offsetWidth/2)+"px;top:"+(e.clientY-20)+"px;";
      document.body.appendChild(ghost);
      e.preventDefault();
    }
    function move(e){
      if(!ghost) return;
      ghost.style.left = (e.clientX - ghost.offsetWidth/2) + "px";
      ghost.style.top = (e.clientY - 20) + "px";
      zones.forEach(z=>z.el.classList.remove("over"));
      const z = zoneAt(e.clientX, e.clientY);
      if(z) z.el.classList.add("over");
    }
    function end(e){
      if(ghost){ ghost.remove(); ghost = null; }
      zones.forEach(z=>z.el.classList.remove("over"));
      if(!dragEl) return;
      dragEl.classList.remove("dragging");
      const z = zoneAt(e.clientX, e.clientY);
      if(z){
        const items = z.el.querySelector(".dz-items") || z.el;
        items.appendChild(dragEl);
        dragEl.classList.add("placed");
      }
      dragEl = null;
      if(opts.onAllPlaced) maybeAllPlaced();
    }
    function maybeAllPlaced(){
      if(pool.querySelectorAll(".chip").length===0 && opts.onAllPlaced) opts.onAllPlaced();
    }

    pool.addEventListener("pointerdown", e=>{
      const c = e.target.closest(".chip");
      if(c) start(e, c);
    });
    document.addEventListener("pointermove", move, {passive:false});
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("dblclick", e=>{
      const c = e.target.closest(".chip");
      if(c && c.parentElement !== pool){ c.classList.remove("placed"); pool.appendChild(c); }
    });

    function placed(){ return document.querySelectorAll(".chip").length - pool.querySelectorAll(".chip").length; }
    function allPlaced(){ return pool.querySelectorAll(".chip").length===0; }
    function check(){
      let allCorrect = true;
      const wrongZones = [];
      zones.forEach(z=>{
        z.el.classList.remove("correct","wrong");
        const items = z.el.querySelectorAll(".chip");
        if(items.length===0) return; // neutral, wenn leer
        let ok = true;
        items.forEach(ch=>{ if(ch.dataset.key!==z.key) ok=false; });
        if(!ok){ allCorrect=false; wrongZones.push(z.id); }
        z.el.classList.add(ok?"correct":"wrong");
      });
      return { allPlaced: allPlaced(), allCorrect: allPlaced() && allCorrect, wrongZones };
    }
    function reset(){
      zones.forEach(z=>{
        z.el.classList.remove("correct","wrong");
        const items = z.el.querySelector(".dz-items") || z.el;
        items.querySelectorAll(".chip").forEach(ch=>{ ch.classList.remove("placed"); pool.appendChild(ch); });
      });
    }
    return { check, reset, placed, allPlaced, pool };
  }

  /* ============================================================
     Multiple Choice
     cfg: { containerId, chapter, taskId, options:[{text, correct, reason}] }
     ============================================================ */
  function initMC(cfg){
    const box = document.getElementById(cfg.containerId);
    if(!box) return;
    box.classList.add("mc");
    // Rec. F: Antworten mischen, damit die richtige Antwort nicht immer an
    // derselben Position steht (Positionsbias brechen). shuffle=false, wenn
    // die Reihenfolge wichtig ist (z.B. passt zu einem Diagramm).
    const options = cfg.options.slice();
    if(cfg.shuffle !== false){
      for(let i=options.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [options[i],options[j]] = [options[j],options[i]];
      }
    }
    let selected = -1;
    options.forEach((o,i)=>{
      const el = document.createElement("div");
      el.className = "mc-opt";
      el.innerHTML = `<span class="radio"></span><span>${o.text}</span>`;
      el.addEventListener("click", ()=>{
        box.querySelectorAll(".mc-opt").forEach(x=>x.classList.remove("selected"));
        el.classList.add("selected");
        selected = i;
      });
      box.appendChild(el);
    });
    const reason = document.createElement("div");
    reason.className = "mc-reason";
    reason.textContent = "Tipp: Wähle eine Antwort und prüfe sie.";
    box.appendChild(reason);

    const btn = document.createElement("button");
    btn.className = "btn btn-primary mt";
    btn.textContent = "Prüfen";
    btn.addEventListener("click", ()=>{
      if(selected<0){ reason.textContent = "Bitte zuerst eine Antwort wählen."; return; }
      const opts = box.querySelectorAll(".mc-opt");
      const ok = options[selected].correct;
      options.forEach((o,i)=>{
        opts[i].classList.remove("correct","wrong");
        if(o.correct) opts[i].classList.add("correct");
        else if(i===selected) opts[i].classList.add("wrong");
      });
      const scope = box.closest(".task") || box.parentElement;
      const fb = scope ? scope.querySelector(".feedback") : null;
      feedback(fb, ok, options[selected].reason || (ok?"Richtig!":"Leider nicht ganz."));
      reason.textContent = options[selected].reason || "";
      if(ok && cfg.taskId) Store.mark(cfg.chapter, cfg.taskId);
      btn.disabled = true;
    });
    box.after(btn);
  }

  /* ============================================================
     Entscheidungsszenario
     cfg: { containerId, chapter, taskId, role, prompt, options:[{text, good, consequence}] }
     ============================================================ */
  function initScenario(cfg){
    const box = document.getElementById(cfg.containerId);
    if(!box) return;
    const wrap = document.createElement("div");
    wrap.className = "scenario";
    wrap.innerHTML = `<div class="role">${cfg.role||"Entscheidung"}</div><p>${cfg.prompt}</p>`;
    const opts = document.createElement("div");
    opts.className = "options";
    const cons = document.createElement("div");
    cons.className = "consequence";
    cfg.options.forEach(o=>{
      const b = document.createElement("button");
      b.className = "opt-btn";
      b.textContent = o.text;
      b.addEventListener("click", ()=>{
        opts.querySelectorAll(".opt-btn").forEach(x=>x.classList.remove("correct","wrong"));
        b.classList.add(o.good?"correct":"wrong");
        cons.classList.remove("good","bad");
        cons.classList.add("show", o.good?"good":"bad");
        cons.textContent = (o.good?"✅ ":"⚠️ ") + o.consequence;
        if(o.good && cfg.taskId) Store.mark(cfg.chapter, cfg.taskId);
      });
      opts.appendChild(b);
    });
    wrap.appendChild(opts);
    wrap.appendChild(cons);
    box.appendChild(wrap);
  }

  /* ============================================================
     Editierbare Datentabelle + Live-Balkendiagramm
     cfg: { tableId, chartId, col }  (Zellen: <td data-col="col">)
     ============================================================ */
  function initEditableTable(cfg){
    const table = document.getElementById(cfg.tableId);
    if(!table) return;
    const col = cfg.col;
    table.querySelectorAll("td[data-col='"+col+"']").forEach(td=>{
      td.classList.add("editable");
      td.contentEditable = "true";
      td.dataset.orig = td.textContent;
    });
    function render(){
      const chart = document.getElementById(cfg.chartId);
      if(!chart) return;
      const rows = [...table.querySelectorAll("tbody tr")];
      const vals = rows.map(tr=>{
        const td = tr.querySelector("td[data-col='"+col+"']");
        return { label: tr.cells[0].textContent, v: parseFloat((td?td.textContent:"").replace(/\./g,"").replace(",", ".")) || 0 };
      });
      const max = Math.max(...vals.map(d=>d.v), 1);
      chart.innerHTML = vals.map((d,i)=>`
        <div class="bar-col">
          <div class="bar-val">${d.v}</div>
          <div class="bar ${i===vals.length-1?"hl":""}" style="height:${(d.v/max*100)}%"></div>
          <div class="bar-lbl">${d.label}</div>
        </div>`).join("");
    }
    table.addEventListener("input", render);
    render();
  }

  /* ============================================================
     CSV-Loader (echte Daten) — fetch + Parser, ohne Bibliothek
     csvLoad(url) -> Promise<Array<Object>>  (erste Zeile = Kopf)
     ============================================================ */
  function csvParse(text){
    // Robuster Parser: behandelt Zebrüche INNERHALB von „"…""-Feldern korrekt.
    const rows=[]; let row=[], cur=""; let inQ=false;
    const s = text.replace(/\r/g,"");
    for(let i=0;i<s.length;i++){
      const ch=s[i];
      if(inQ){
        if(ch==='"'){
          if(s[i+1]==='"'){ cur+='"'; i++; }
          else inQ=false;
        } else cur+=ch;
      } else {
        if(ch==='"') inQ=true;
        else if(ch===','){ row.push(cur); cur=""; }
        else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
        else cur+=ch;
      }
    }
    // letztes Feld/zeile
    if(cur!=="" || row.length){ row.push(cur); rows.push(row); }
    // leere Zeilen entfernen
    const clean = rows.filter(r=>!(r.length===1 && r[0].trim()===""));
    if(clean.length<2) return [];
    const head=clean[0];
    return clean.slice(1).map(r=>{
      const o={};
      head.forEach((h,i)=>{ o[h]=(r[i]!==undefined?r[i]:"").trim(); });
      return o;
    });
  }
  function csvLoad(url){
    return fetch(url).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); })
      .then(csvParse);
  }

  /* ============================================================
     «Begründe in einem Satz» — freier Reflexions-Input (Rec. C)
     cfg: { containerId, prompt, chapter, taskId }
     Optional: taskId wird als erledigt markiert, wenn >= minChars Zeichen.
     ============================================================ */
  function reasonBox(cfg){
    const box = document.getElementById(cfg.containerId);
    if(!box) return;
    box.classList.add("reasonwrap");
    box.innerHTML = `<div class="reason-q">${cfg.prompt||"Begründe deine Antwort in einem Satz."}</div>`;
    const ta = document.createElement("textarea");
    ta.className = "reasonbox"; ta.rows = 2;
    ta.placeholder = "Deine Begründung …";
    box.appendChild(ta);
    const note = document.createElement("div");
    note.className = "reason-note"; note.textContent = "Frei formulieren — es gibt kein Richtig oder Falsch, aber: Argumente machen Entscheidungen überprüfbar.";
    box.appendChild(note);
    if(cfg.taskId){
      const min = cfg.minChars || 15;
      const done = document.createElement("div");
      done.className = "reason-done"; done.style.display="none";
      done.innerHTML = "✅ Notiert — gut so.";
      box.appendChild(done);
      ta.addEventListener("input", ()=>{
        const ok = ta.value.trim().length >= min;
        done.style.display = ok ? "block" : "none";
        if(ok) Store.mark(cfg.chapter, cfg.taskId);
      });
    }
  }

  /* ============================================================
     Lernziele + «Kann ich?»-Selbstcheck (Rec. E)
     cfg: { containerId, items:[{text, key}] , chapter }
     Selbstcheck-Checkboxen; wenn alle gesetzt -> Store.mark(chapter,"selfcheck")
     ============================================================ */
  function initObjectives(cfg){
    const box = document.getElementById(cfg.containerId);
    if(!box) return;
    box.classList.add("objectives");
    let html = `<div class="obj-head">🎯 Lernziele dieses Kapitels</div><ul class="obj-list">`;
    (cfg.items||[]).forEach(it=>{ html += `<li>${it.text}</li>`; });
    html += `</ul>`;
    if(cfg.items && cfg.items.length){
      html += `<div class="obj-self">Kann ich das jetzt?</div><ul class="obj-check">`;
      cfg.items.forEach((it,i)=>{ html += `<li data-i="${i}"><span class="obox"></span>${it.check||it.text}</li>`; });
      html += `</ul>`;
    }
    box.innerHTML = html;
    const check = box.querySelector(".obj-check");
    if(check){
      const lis = [...check.querySelectorAll("li")];
      const all = () => lis.every(li=>li.classList.contains("done"));
      lis.forEach(li=>{
        li.addEventListener("click", ()=>{
          li.classList.toggle("done");
          if(all() && cfg.chapter) Store.mark(cfg.chapter, "selfcheck");
        });
      });
    }
  }

  function autoInit(){ Store.refresh(); }

  window.KI = { Store, feedback, dragKit, initMC, initScenario, initEditableTable, csvLoad, csvParse, reasonBox, initObjectives };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
