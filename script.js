

const allSongs = [];
let songsRaw = [];

const songsContainer = document.getElementById('songs-container');
const songCountLabel = document.getElementById('song-count');
const audioPlayer = document.getElementById('audio-element');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerCover = document.getElementById('player-cover');

const searchInput = document.getElementById('search-input');
const lengthFilter = document.getElementById('length-filter');
const genreFilter = document.getElementById('genre-filter');
const artistFilter = document.getElementById('artist-filter');
const resetBtn = document.getElementById('reset-btn');


function sanitizeForFilename(s) {
  return (s || '').replace(/[\/\\?%*:|"<>]/g, '').replace(/\s+/g, ' ').trim();
}

function parseDurationToSeconds(d) {
  if (!d) return 0;
  // accept "5:40", "03:12", "1:02:30"
  const parts = d.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// categorize by duration cluster: Short (<180s), Mid (180-300), Long (>300)
function durationCluster(seconds) {
  if (seconds === 0) return 'all';
  if (seconds < 180) return 'Short';
  if (seconds <= 300) return 'Mid';
  return 'Long';
}

// load JSON
async function loadData() {
  try {
    console.log('Fetching duration_fix.json...');
    const res = await fetch('duration_fix.json', {cache: "no-store"});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    songsRaw.length = 0;
    songsRaw.push(...(Array.isArray(data) ? data : (data.songs || [])));
    if (!songsRaw.length) throw new Error('No songs found in JSON');

    // normalize and enrich objects
    songsRaw.forEach(s => {
      const song = Object.assign({}, s);
      song.video_id = song.video_id || song.videoId || song.id || '';
      song.title = song.title || song.name || 'Untitled';
      song.artist_name = song.artist_name || song.artist || song.artistName || '';
      song.duration =  song.listen ||'';
      // ensure genre is array
      if (!song.genre) song.genre = [];
      else if (!Array.isArray(song.genre)) song.genre = [song.genre];
            // always parse seconds from the duration string (if present)
      song._seconds = parseDurationToSeconds(song.duration);

      // if the original JSON already provides a valid 'listen' label, prefer it;
      // otherwise compute the cluster from the parsed seconds
      const origListen = (s.listen || '').toString();
      song._lenCluster = ['Short', 'Mid', 'Long'].includes(origListen) ? origListen : durationCluster(song._seconds);

      // fallback small fields
      song.album = song.album || '';
      songsRaw[songsRaw.indexOf(s)] = song;
    });

    // attach to global
    allSongs.splice(0, allSongs.length, ...songsRaw);

    populateDropdowns();
    renderSongs(allSongs);
    console.log(`Loaded ${allSongs.length} songs.`);
  } catch (err) {
    console.error('Failed to load JSON:', err);
    songsContainer.innerHTML =
  `<div class="card" style="padding:14px">
      <strong style="color:#ff8a8a">Error loading duration_fix.json</strong><br>
      ${String(err).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
   </div>`;

  }
}

function populateDropdowns() {
  // clear
  genreFilter.innerHTML = '<option value="all">All Genres</option>';
  artistFilter.innerHTML = '<option value="all">All Artists</option>';

  const gSet = new Set();
  const aSet = new Set();

  allSongs.forEach(s => {
    if (Array.isArray(s.genre)) s.genre.forEach(g => g && gSet.add(g));
    else if (s.genre) gSet.add(s.genre);

    if (s.artist_name) {
      s.artist_name.split(',').map(a => a.trim()).forEach(a => a && aSet.add(a));
    }
  });

  Array.from(gSet).sort().forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    genreFilter.appendChild(opt);
  });

  Array.from(aSet).sort().forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    artistFilter.appendChild(opt);
  });
}

function renderSongs(songs) {
  songsContainer.innerHTML = '';
  songCountLabel.textContent = `${songs.length} songs found`;

  songs.forEach(song => {
    const card = document.createElement('div');
    card.className = 'card';
    const coverPath = `real_covers/${song.video_id}.jpg`;
    const durationTag = song.duration || 'Unknown';
    const genreText = (Array.isArray(song.genre) && song.genre.length) ? song.genre.join(', ') : 'Pop';
    const artistText = song.artist_name || 'Unknown Artist';

    card.innerHTML = `
      <img loading="lazy" src="${coverPath}" alt="${song.title} cover" onerror="this.src='https://via.placeholder.com/400x300?text=No+Cover'">
      <h3>${song.title}</h3>
      <p>${artistText}</p>
      <div class="tags">
        <div class="tag len">${durationTag}</div>
        <div class="tag">${genreText}</div>
      </div>
    `;

    card.addEventListener('click', () => playSong(song));
    songsContainer.appendChild(card);
  });
}

// Attempt to play list of candidate sources in order
function tryPlaySources(sources, index = 0, titleForAlert = 'audio') {
  if (index >= sources.length) {
    alert(`Could not play ${titleForAlert}. Checked ${sources.length} sources.`);
    return;
  }
  const src = sources[index];
  audioPlayer.pause();
  audioPlayer.src = src;
  audioPlayer.load();

  // try to play; on failure, try next source
  audioPlayer.play().then(() => {
    console.log('Playing', src);
  }).catch(err => {
    console.warn('Play failed for', src, err);
    // wait a tiny bit to allow error event to fire if it's an immediate network error
    setTimeout(() => tryPlaySources(sources, index + 1, titleForAlert), 150);
  });
}

// Play a song given song object
function playSong(song) {
  const safeTitle = sanitizeForFilename(song.title || song.video_id);
  // primary: songs/<sanitized-title>-<video_id>.m4a
  const candidates = [
    `songs/${safeTitle}-${song.video_id}.m4a`,
    `songs/${song.video_id}.m4a`,
    `songs/${safeTitle}-${song.video_id}.mp3`,
    `songs/${song.video_id}.mp3`
  ];

  playerTitle.textContent = song.title || song.video_id;
  playerArtist.textContent = song.artist_name || 'Unknown';
  playerCover.src = `real_covers/${song.video_id}.jpg`;
  playerCover.onerror = () => playerCover.src = 'https://via.placeholder.com/64?text=No+Cover';

  tryPlaySources(candidates, 0, song.title || song.video_id);
}

// Filtering logic
function filterSongs() {
  const term = (searchInput.value || '').toLowerCase();
  const selLen = lengthFilter.value;
  const selGenre = genreFilter.value;
  const selArtist = artistFilter.value;

  const filtered = allSongs.filter(s => {
    const title = (s.title || '').toLowerCase();
    const artist = (s.artist_name || '').toLowerCase();
    const matchesSearch = (!term) || title.includes(term) || artist.includes(term);
    const matchesLen = selLen === 'all' || s._lenCluster === selLen;
    let matchesGenre = true;
    if (selGenre !== 'all') {
      if (Array.isArray(s.genre)) matchesGenre = s.genre.includes(selGenre);
      else matchesGenre = s.genre === selGenre;
    }
    const matchesArtist = selArtist === 'all' || (s.artist_name && s.artist_name.includes(selArtist));
    return matchesSearch && matchesLen && matchesGenre && matchesArtist;
  });

  renderSongs(filtered);
}

// events
searchInput.addEventListener('input', filterSongs);
lengthFilter.addEventListener('change', filterSongs);
genreFilter.addEventListener('change', filterSongs);
artistFilter.addEventListener('change', filterSongs);
resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  lengthFilter.value = 'all';
  genreFilter.value = 'all';
  artistFilter.value = 'all';
  filterSongs();
});

// Start
loadData();
