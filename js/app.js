const state = { photos: [], tags: [], trips: [], filter: null };

async function loadAll() {
  const [photos, tags, trips] = await Promise.all([
    fetchJSON('api/photos.php' + filterQuery()),
    fetchJSON('api/tags.php'),
    fetchJSON('api/trips.php'),
  ]);
  state.photos = photos || [];
  state.tags = tags || [];
  state.trips = trips || [];
  renderGrid();
  renderTags();
  renderTrips();
}

function filterQuery() {
  if (!state.filter) return '';
  if (state.filter.type === 'tag') return `?tag_id=${state.filter.id}`;
  if (state.filter.type === 'trip') return `?trip_id=${state.filter.id}`;
  return '';
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  return res.json();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const photo of state.photos) {
    const div = document.createElement('div');
    div.className = 'tile';
    div.style.backgroundImage = `url(${photo.thumb_url})`;
    div.addEventListener('click', () => openLightbox(photo));
    grid.appendChild(div);
  }
}

function renderTags() {
  const byCategory = { cestovani: [], zeme: [], akce: [] };
  for (const tag of state.tags) {
    if (byCategory[tag.category]) byCategory[tag.category].push(tag);
  }
  for (const category of Object.keys(byCategory)) {
    const container = document.getElementById(`tags-${category}`);
    container.innerHTML = '';
    for (const tag of byCategory[category]) {
      const pill = document.createElement('span');
      pill.className = `tag-pill cat-${tag.category}`;
      pill.textContent = tag.name;
      pill.addEventListener('click', () => applyFilter('tag', tag.id, tag.name));
      container.appendChild(pill);
    }
  }
}

function renderTrips() {
  const container = document.getElementById('trips');
  container.innerHTML = '';
  for (const trip of state.trips.slice(0, 3)) {
    const card = document.createElement('div');
    card.className = 'trip-card';
    card.innerHTML = `
      <div class="trip-cover" style="background-image:url(${trip.cover_url || ''})"></div>
      <p class="trip-name">${trip.name}</p>
      <p class="trip-date">${trip.date_from || ''}</p>
    `;
    card.addEventListener('click', () => applyFilter('trip', trip.id, trip.name));
    container.appendChild(card);
  }
}

function applyFilter(type, id, label) {
  state.filter = { type, id };
  document.getElementById('active-filter').hidden = false;
  document.getElementById('active-filter-label').textContent = label;
  loadAll();
}

document.getElementById('clear-filter').addEventListener('click', () => {
  state.filter = null;
  document.getElementById('active-filter').hidden = true;
  loadAll();
});

function openLightbox(photo) {
  const lightbox = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = photo.url;
  const tagsEl = document.getElementById('lightbox-tags');
  tagsEl.innerHTML = '';
  for (const tag of photo.tags) {
    const pill = document.createElement('span');
    pill.className = `tag-pill cat-${tag.category}`;
    pill.textContent = tag.name;
    tagsEl.appendChild(pill);
  }
  lightbox.hidden = false;
}

document.getElementById('lightbox-close').addEventListener('click', () => {
  document.getElementById('lightbox').hidden = true;
});

document.getElementById('upload-btn').addEventListener('click', () => {
  document.getElementById('upload-input').click();
});

document.getElementById('upload-input').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  const formData = new FormData();
  for (const file of files) formData.append('photos[]', file);
  await fetch('api/upload.php', { method: 'POST', body: formData });
  e.target.value = '';
  loadAll();
});

loadAll();
