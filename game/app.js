/* ============================================================
   Lernspiel KI-Management — Gemeinsame Task-Engine (app.js)
   Wiederverwendbare Komponenten: Drag&Drop, Multiple-Choice,
   Entscheidungsszenarien, editierbare Datentabelle, Fortschritt.
   Kein Build-Schritt, Vanilla JS. Touch-tauglich.
   ============================================================ */

(function(){
  "use strict";

  /* ---------- Fortschritt (localStorage) ---------- */
  const Store = {
    key: "kilearning_progress_v1",
    read(){ try{ return JSON.parse(localStorage.getItem(this.key)) || {}; }catch(e){ return {}; } },
    write(o){ try{ localStorage.setItem(this.key, JSON.stringify(o)); }catch(e){} },
    mark(chapter, taskId){
      const o = this.read();
      o[chapter] = o[chapter] || {done:[]};
      if(!o[chapter].done.includes(taskId)){ o[chapter].done.push(taskId); }
      this.write(o);
      this.refresh();
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
    el.classList.remove("ok","no");
    el.classList.add("show", ok?"ok":"no");
    el.innerHTML = `<span class="fb-ico">${ok?"✅":"❌"}</span><span>${msg}</span>`;
  }

  /* ============================================================
     Drag & Drop (Pointer Events → funktioniert auf Touch + Maus)
     Config: { poolId, zones:[{id, label, accept:[chipId,...]}], onCheck }
     ============================================================ */
  function initDnD(cfg){
    const pool = document.getElementById(cfg.poolId);
    if(!pool) return;
    const zones = cfg.zones.map(z=>({ ...z, el: document.getElementById(z.id) })).filter(z=>z.el);
    let dragEl = null, ghost = null;

    // Chips erzeugen aus cfg.chips = [{id, text, correctZone}]
    (cfg.chips||[]).forEach(c=>{
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.draggable = true;
      chip.dataset.id = c.id;
      chip.dataset.correct = c.correctZone;
      chip.textContent = c.text;
      pool.appendChild(chip);
    });

    function startDrag(e, chip){
      dragEl = chip;
      chip.classList.add("dragging");
      ghost = chip.cloneNode(true);
      ghost.classList.add("dragging");
      ghost.style.position = "fixed";
      ghost.style.zIndex = 999;
      ghost.style.pointerEvents = "none";
      ghost.style.width = chip.offsetWidth + "px";
      ghost.style.left = (e.clientX - chip.offsetWidth/2) + "px";
      ghost.style.top = (e.clientY - 18) + "px";
      document.body.appendChild(ghost);
      e.preventDefault();
    }
    function moveDrag(e){
      if(!ghost) return;
      ghost.style.left = (e.clientX - ghost.offsetWidth/2) + "px";
      ghost.style.top = (e.clientY - 18) + "px";
      // Highlight Zone unter Cursor
      zones.forEach(z=>z.el.classList.remove("over"));
      const under = zoneUnder(e.clientX, e.clientY);
      if(under) under.el.classList.add("over");
    }
    function zoneUnder(x,y){
      const hit = document.elementFromPoint(x,y);
      if(!hit) return null;
      const dz = hit.closest(".dropzone");
      if(!dz) return null;
      return zones.find(z=>z.el===dz) || null;
    }
    function endDrag(e){
      if(ghost){ ghost.remove(); ghost=null; }
      zones.forEach(z=>z.el.classList.remove("over"));
      if(!dragEl) return;
      dragEl.classList.remove("dragging");
      const target = zoneUnder(e.clientX, e.clientY);
      if(target){
        target.el.querySelector(".dz-items").appendChild(dragEl);
        dragEl.classList.add("placed");
      }
      dragEl = null;
      // Auto-Check, wenn alle Chips platziert
      const remaining = pool.querySelectorAll(".chip").length;
      if(remaining===0 && cfg.onCheck) cfg.onCheck();
    }

    pool.addEventListener("pointerdown", e=>{
      const chip = e.target.closest(".chip");
      if(chip && !chip.classList.contains("placed")) startDrag(e, chip);
    });
    document.addEventListener("pointermove", moveDrag, {passive:false});
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);

    // Doppelklick / 2x-Tap: Chip zurück in Pool
    pool.addEventListener("dblclick", e=>{
      const chip = e.target.closest(".chip");
      if(chip){ chip.classList.remove("placed"); pool.appendChild(chip); }
    });
  }

  /* ============================================================
     Multiple Choice
     Config: { containerId, options:[{text, correct, reason}] }
     ============================================================ */
  function initMC(cfg){
    const box = document.getElementById(cfg.containerId);
    if(!box) return;
    box.classList.add("mc");
    let selected = -1;
    cfg.options.forEach((o,i)=>{
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
      const ok = cfg.options[selected].correct;
      cfg.options.forEach((o,i)=>{
        opts[i].classList.remove("correct","wrong");
        if(o.correct) opts[i].classList.add("correct");
        else if(i===selected) opts[i].classList.add("wrong");
      });
      const fb = box.closest(".task").querySelector(".feedback");
      feedback(fb, ok, cfg.options[selected].reason || (ok?"Richtig!":"Leider nicht ganz."));
      reason.textContent = cfg.options[selected].reason || "";
      if(ok && cfg.taskId) Store.mark(cfg.chapter, cfg.taskId);
      btn.disabled = true;
    });
    box.after(btn);
  }

  /* ============================================================
     Entscheidungsszenario
     Config: { containerId, prompt, options:[{text, good, consequence}] }
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
     Config: { tableId, chartId, rows:[{label, values:{col:val}}], col, unit }
     ============================================================ */
  function initEditableTable(cfg){
    const table = document.getElementById(cfg.tableId);
    if(!table) return;
    const col = cfg.col;
    // Werte in Zellen eintragen, editierbar
    table.querySelectorAll("td[data-col]").forEach(td=>{
      if(td.dataset.col===col){
        td.classList.add("editable");
        td.contentEditable = "true";
        td.dataset.orig = td.textContent;
      }
    });
    table.addEventListener("input", ()=>{
      const changed = table.querySelectorAll("td[data-col='"+col+"']");
      changed.forEach(td=>{
        const v = parseFloat(td.textContent.replace(/\./g,"").replace(",", "."));
        td.classList.toggle("changed", !isNaN(v) && v !== parseFloat(td.dataset.orig));
      });
      renderChart();
    });
    function renderChart(){
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
          <div class="bar-val">${d.v? (d.v/1e6).toFixed(0)+"M":""}</div>
          <div class="bar ${i===vals.length-1?"hl":""}" style="height:${(d.v/max*100)}%"></div>
          <div class="bar-lbl">${d.label}</div>
        </div>`).join("");
    }
    renderChart();
  }

  /* ---------- Auto-Init ----------
     Kapitel-Seiten rufen die Funktionen direkt auf, z.B.:
       KI.initDnD({ poolId:"pool", chips:[...], zones:[...], onCheck });
       KI.initMC({ containerId:"mc1", chapter:"k1", taskId:"t1", options:[...] });
       KI.initScenario({ containerId:"sc1", prompt:"...", options:[...] });
       KI.initEditableTable({ tableId:"tbl", chartId:"chart", col:"photovoltaik_kwh" });
     autoInit() kümmert sich nur um den Fortschritt. */
  function autoInit(){
    Store.refresh();
  }

  // Öffentliche API
  window.KI = { Store, initDnD, initMC, initScenario, initEditableTable, feedback };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
