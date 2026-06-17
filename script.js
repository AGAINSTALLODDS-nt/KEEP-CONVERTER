let allNotes = [];
let currentLang = 'en';
let lang = {};

// === УПРАВЛЕНИЕ ЯЗЫКОМ ===
async function loadLanguage(langCode) {
  const script = document.createElement('script');
  script.src = `lang/${langCode}.js`;
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${langCode}`));
  });
  lang = langCode === 'en' ? LANG_EN : LANG_RU;
  applyTranslations();
}

function changeLanguage(code) {
  currentLang = code;
  loadLanguage(code);
}

function applyTranslations() {
  if (!lang.title) return;
  document.getElementById('pageTitle').innerText = lang.title;
  document.getElementById('btnSelectAll').innerText = lang.selectAll;
  document.getElementById('exportButton').innerText = lang.exportSelected;
}
loadLanguage(currentLang);

// === МОДАЛЬНОЕ ОКНО ПРОСМОТРА ===
function openNoteModal(note) {
  const modal = document.getElementById('noteModal');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  
  let displayTitle = note.title;
  if (!displayTitle && note.createdTimestampUsec) {
    const date = new Date(parseInt(note.createdTimestampUsec) / 1000000);
    displayTitle = date.toLocaleString(currentLang, { 
      year:'numeric', month:'long', day:'numeric', 
      hour:'2-digit', minute:'2-digit' 
    });
  }
  titleEl.textContent = displayTitle || 'Untitled Note';
  
  if (Array.isArray(note.listContent)) {
    let html = '<ul>';
    note.listContent.forEach(item => {
      const isChecked = item.isChecked;
      const className = isChecked ? ' class="todo-checked"' : '';
      const text = item.textHtml || escapeXML(item.text || '');
      html += `<li${className}>${text}</li>`;
    });
    html += '</ul>';
    bodyEl.innerHTML = html;
  } else if (note.textContentHtml) {
    bodyEl.innerHTML = note.textContentHtml;
  } else if (note.textContent) {
    bodyEl.textContent = note.textContent;
  } else {
    bodyEl.textContent = '(Empty note)';
  }
  
  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('noteModal').style.display = 'none';
}

// === ОСНОВНАЯ ЛОГИКА ЗАГРУЗКИ И РЕНДЕРИНГА ===
async function startProcessing() {
  const fileInput = document.getElementById('zipInput');
  if (!fileInput.files.length) return alert(lang.uploadFile || 'Please select a file');

  clearLog();
  log(lang.processingTitle);
  const file = fileInput.files[0];
  log(lang.fileLoaded + file.name);

  try {
    log(lang.readingZip);
    const arrayBuffer = await file.arrayBuffer();
    log(lang.unpacking);
    const zip = fflate.unzipSync(new Uint8Array(arrayBuffer));
    
    const noteFiles = Object.keys(zip).filter(f => f.endsWith('.json'));
    log(`${lang.searchingJson} (${noteFiles.length})`);
    
    if (noteFiles.length === 0) { log('❌ No .json files found.'); return; }

    allNotes = [];
    let processed = 0;
    for (const filename of noteFiles) {
      try {
        const content = new TextDecoder().decode(zip[filename]);
        const note = JSON.parse(content);
        note.index = allNotes.length; // Критически важно для экспорта
        allNotes.push(note);
      } catch (e) { log(`⚠️ Parse error: ${filename}`); }
      
      processed++;
      updateProgressBar((processed / noteFiles.length) * 100);
      if (processed % 50 === 0) await new Promise(r => setTimeout(r, 1));
    }
    
    log(lang.notesLoaded);
    groupAndRenderNotes();
  } catch (err) {
    log(`❌ Critical Error: ${err.message}`);
  }
}

function groupAndRenderNotes() {
  const container = document.getElementById('notesContainer');
  container.innerHTML = '';
  const grouped = {};

  log(lang.groupingNotes);
  allNotes.forEach((note) => {
    let title = note.title;
    if (!title && note.createdTimestampUsec) {
      const date = new Date(parseInt(note.createdTimestampUsec) / 1000000);
      title = date.toLocaleString(currentLang, { 
        year:'numeric', month:'short', day:'numeric', 
        hour:'2-digit', minute:'2-digit' 
      });
    }
    if (!title) title = 'Untitled Note';

    const labels = note.labels?.map(l => l.name) || [];
    const targetLabels = labels.length ? labels : ['No Label'];

    targetLabels.forEach(labelName => {
      if (!grouped[labelName]) grouped[labelName] = [];
      grouped[labelName].push({ ...note, displayTitle: title });
    });
  });

  log(`${lang.groupedByLabels} ${Object.keys(grouped).length}`);

  for (const [label, notes] of Object.entries(grouped)) {
    const col = document.createElement('div');
    col.className = 'label-column';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '▼';
    toggleBtn.onclick = () => {
      const list = col.querySelector('.notes-list');
      const isHidden = list.style.display === 'none';
      list.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '▼' : '▶';
    };

    const selectColBtn = document.createElement('button');
    selectColBtn.textContent = '☑️';
    selectColBtn.onclick = () => {
      const cbs = col.querySelectorAll('input[type="checkbox"]');
      const allChecked = Array.from(cbs).every(c => c.checked);
      cbs.forEach(c => c.checked = !allChecked);
      selectColBtn.textContent = allChecked ? '' : '☑️';
    };

    header.appendChild(toggleBtn);
    const titleSpan = document.createElement('strong');
    titleSpan.textContent = label;
    titleSpan.style.flexGrow = 1;
    titleSpan.style.textAlign = 'center';
    header.appendChild(titleSpan);
    header.appendChild(selectColBtn);
    col.appendChild(header);

    const list = document.createElement('div');
    list.className = 'notes-list';

    notes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note-item';
      
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `chk-${note.index}`;
      cb.dataset.index = note.index;
      
      const lbl = document.createElement('label');
      lbl.htmlFor = `chk-${note.index}`;
      lbl.textContent = note.displayTitle;
      // Открытие модального окна при клике на название
      lbl.onclick = (e) => {
        e.preventDefault(); 
        openNoteModal(note);
      };

      item.appendChild(cb);
      item.appendChild(lbl);
      list.appendChild(item);
    });

    col.appendChild(list);
    container.appendChild(col);
  }
  log(lang.displayReady);
}

function selectAllNotes() {
  const checkboxes = document.querySelectorAll('#notesContainer input[type="checkbox"]');
  if (!checkboxes.length) return;
  const allChecked = Array.from(checkboxes).every(c => c.checked);
  checkboxes.forEach(c => c.checked = !allChecked);
}

// === ЭКСПОРТ С ПОДДЕРЖКОЙ ПАПOK И ЧЕКБОКСОВ ===
function exportSelectedNotes() {
  const checked = document.querySelectorAll('#notesContainer input[type="checkbox"]:checked');
  if (!checked.length) return alert(lang.noNotesSelected);

  log(lang.exporting);
  
  // Исправленный заголовок XML (без лишних пробелов)
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export.dtd">
<en-export export-date="${new Date().toISOString().split('T')[0]}" application="Evernote" version="10.20.4">`;

  checked.forEach(input => {
    const idx = parseInt(input.getAttribute('data-index'));
    const note = allNotes[idx];
    if (!note) return;

    // Определение папки из первой метки
    let notebookName = 'Imported Notes';
    if (note.labels && note.labels.length > 0 && note.labels[0].name) {
      notebookName = note.labels[0].name.replace(/[<>:"\/\\|?*]/g, '_').trim();
    }

    let content = '';
    
    // Обработка списков с чекбоксами
    if (Array.isArray(note.listContent)) {
      content = '<ul>';
      note.listContent.forEach(item => {
        const isChecked = item.isChecked ? ' checked="true"' : '';
        let text = item.text || '';
        if (item.textHtml) {
          // Очистка HTML для корректной работы en-todo
          text = item.textHtml.replace(/<[^>]*>/g, ''); 
        }
        content += `<li><en-todo${isChecked}/>${escapeXML(text)}</li>`;
      });
      content += '</ul>';
    } 
    // Обычный текст или HTML
    else if (note.textContentHtml) {
      content = note.textContentHtml;
    } else if (note.textContent) {
      content = escapeXML(note.textContent).replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
    } else {
      content = 'Empty note';
    }

    const title = escapeXML(note.title || 'Untitled');
    
    // Безопасная обработка даты
    let ts = Date.now();
    if (note.userEditedTimestampUsec && note.userEditedTimestampUsec > 0) {
      ts = parseInt(note.userEditedTimestampUsec) / 1000000;
    } else if (note.createdTimestampUsec && note.createdTimestampUsec > 0) {
      ts = parseInt(note.createdTimestampUsec) / 1000000;
    }
    const dateStr = formatDate(ts);

    // Формирование тега <note> с внутренним <notebook>
    xml += `
<note>
  <title>${title}</title>
  <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${content}</en-note>]]></content>
  <created>${dateStr}</created>
  <updated>${dateStr}</updated>
  <notebook>${escapeXML(notebookName)}</notebook>
</note>`;
  });

  xml += '\n</en-export>';
  downloadFile(xml, 'keep_notes.enex', 'text/xml');
  log(lang.exportComplete);
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function updateProgressBar(percent) {
  const bar = document.getElementById('bar');
  bar.style.width = percent + '%';
}
function clearLog() { document.getElementById('log').innerHTML = ''; }
function log(msg) {
  const div = document.getElementById('log');
  div.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  div.scrollTop = div.scrollHeight;
}
function escapeXML(str) {
  if (!str) return '';
  return str.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'})[c]);
}
function formatDate(timestamp) {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15) + 'Z';
  return d.toISOString().replace(/[-:T.]/g, '').slice(0, 15) + 'Z';
}
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

