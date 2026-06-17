let allNotes = [];
let currentLang = 'en'; // Язык по умолчанию
let lang = {}; // Объект переводов

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

// Загрузка начального языка
loadLanguage(currentLang);

// === ОСНОВНАЯ ЛОГИКА ===

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

    if (noteFiles.length === 0) {
      log('❌ No .json files found in archive.');
      return;
    }

    allNotes = []; // Сброс массива
    let processed = 0;

    for (const filename of noteFiles) {
      try {
        const content = new TextDecoder().decode(zip[filename]);
        const note = JSON.parse(content);
        
        // ВАЖНО: Явно присваиваем индекс для корректной работы чекбоксов
        note.index = allNotes.length; 
        allNotes.push(note);
      } catch (e) {
        log(`⚠️ Parse error: ${filename}`);
      }

      processed++;
      updateProgressBar((processed / noteFiles.length) * 100);
      
      // Небольшая пауза чтобы UI не зависал
      if (processed % 50 === 0) await new Promise(r => setTimeout(r, 1));
    }

    log(lang.notesLoaded);
    groupAndRenderNotes();
    
  } catch (err) {
    log(`❌ Critical Error: ${err.message}`);
    console.error(err);
  }
}

function groupAndRenderNotes() {
  const container = document.getElementById('notesContainer');
  container.innerHTML = '';
  const grouped = {};

  log(lang.groupingNotes);

  allNotes.forEach((note) => {
    // Генерация заголовка: либо title, либо дата создания
    let title = note.title;
    if (!title && note.createdTimestampUsec) {
      const date = new Date(parseInt(note.createdTimestampUsec) / 1000000);
      title = date.toLocaleString(currentLang, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
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

  // Рендеринг колонок
  for (const [label, notes] of Object.entries(grouped)) {
    const col = document.createElement('div');
    col.className = 'label-column';

    // Хедер колонки
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
    selectColBtn.title = 'Toggle selection for this column';
    selectColBtn.onclick = () => {
      const checkboxes = col.querySelectorAll('input[type="checkbox"]');
      const allChecked = Array.from(checkboxes).every(c => c.checked);
      checkboxes.forEach(c => c.checked = !allChecked);
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

    // Список заметок
    const list = document.createElement('div');
    list.className = 'notes-list';

    notes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note';
      // Используем note.index из исходного объекта для связи
      item.innerHTML = `
        <input type="checkbox" id="chk-${note.index}" data-index="${note.index}">
        <label for="chk-${note.index}">${escapeXML(note.displayTitle)}</label>
      `;
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

function exportSelectedNotes() {
  const checked = document.querySelectorAll('#notesContainer input[type="checkbox"]:checked');
  if (!checked.length) return alert(lang.noNotesSelected);

  log(lang.exporting);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export.dtd">
<en-export export-date="${new Date().toISOString().split('T')[0]}" application="Evernote" version="10.20.4">`;

  checked.forEach(input => {
    const idx = parseInt(input.getAttribute('data-index'));
    const note = allNotes[idx];
    if (!note) return;

    // Формирование контента
    let content = '';
    if (Array.isArray(note.listContent)) {
      content = '<ul>' + note.listContent.map(item => {
        const style = item.isChecked ? ' style="text-decoration:line-through;color:#888"' : '';
        const text = item.textHtml || escapeXML(item.text || '');
        return `<li${style}>${text}</li>`;
      }).join('') + '</ul>';
    } else if (note.textContentHtml) {
      content = note.textContentHtml;
    } else if (note.textContent) {
      content = escapeXML(note.textContent).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    } else {
      content = 'Empty note';
    }

    const title = escapeXML(note.title || 'Untitled');
    const ts = note.userEditedTimestampUsec ? parseInt(note.userEditedTimestampUsec) / 1000000 : Date.now();
    const dateStr = formatDate(ts);

    xml += `
<note>
  <title>${title}</title>
  <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${content}</en-note>]]></content>
  <created>${dateStr}</created>
  <updated>${dateStr}</updated>
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
  bar.textContent = Math.round(percent) + '%';
}

function clearLog() {
  document.getElementById('log').innerHTML = '';
}

function log(msg) {
  const div = document.getElementById('log');
  div.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  div.scrollTop = div.scrollHeight;
}

function escapeXML(str) {
  if (!str) return '';
  return str.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[c]);
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
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

