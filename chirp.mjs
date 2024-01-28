import iRealMusicXML from 'https://cdn.jsdelivr.net/npm/ireal-musicxml@1.13/+esm';
import JSZip from 'https://cdn.jsdelivr.net/npm/@progress/jszip-esm/+esm';

const g_state = {
  stop: false
}

async function populateSheets(ireal) {
  const playlist = new iRealMusicXML.Playlist(ireal);
  const sheets = document.getElementById('sheets');
  const template = document.getElementById('sheets-template');
  const progress = document.getElementById('progress-bar');
  sheets.innerHTML = '';
  progress.style.width = 0;
  const zip = new JSZip();
  g_state.stop = false;

  // Create "All songs" entry at the top, initially empty.
  const first = template.content.cloneNode(true).querySelector('.sheet-item');
  const firstTitle = 'ALL SONGS';
  first.querySelector('.sheet-title').textContent = firstTitle;
  sheets.appendChild(first);

  // Create entries for all songs.
  for (const [n, song] of playlist.songs.entries()) {
    if (g_state.stop) break;

    const item = template.content.cloneNode(true).querySelector('.sheet-item');
    // Song title.
    item.querySelector('.sheet-title').textContent = song.title;
    // MusicXML file.
    const filename = song.title.toLowerCase().replace(/[/\\?%*:|"'<>\s]/g, '-');
    const musicXml = iRealMusicXML.MusicXML.convert(song, {
      notation: 'rhythmic'
    });
    zip.file(`${filename}.musicxml`, musicXml);
    const a1 = document.createElement('a');
    a1.setAttribute('href', 'data:text/xml;charset=utf-8,' + encodeURIComponent(musicXml));
    a1.setAttribute('download', `${filename}.musicxml`);
    a1.innerText = `musicxml`;
    item.querySelector('.sheet-musicxml').appendChild(a1);
    // MIDI file.
    try {
      const formData = new FormData();
      formData.append('musicXml', new Blob([musicXml], { type: 'text/xml' }));
      formData.append('globalGroove', 'None');
      const response = await fetish(window.location.href + 'mma/convert', {
        method: 'POST',
        body: formData,
      });
      const midiBuffer = await response.arrayBuffer();
      zip.file(`${filename}.mid`, midiBuffer, { binary: true });
      const a2 = document.createElement('a');
      a2.setAttribute('href', URL.createObjectURL(new Blob([midiBuffer], { type: 'audio/midi' })));
      a2.setAttribute('download', `${filename}.mid`);
      a2.innerText = `midi`;
      item.querySelector('.sheet-midi').appendChild(a2);
    }
    catch (error) {
      console.error(`Failed to convert ${song.title}: ${error}`);
      item.querySelector('.sheet-midi').textContent = '⚠';
    }
    // Show the song.
    sheets.appendChild(item);
    progress.style.width = ((n+1) * 100 / playlist.songs.length) + '%';
    await yielder();
  };

  // Add zip package to first entry.
  const filename = firstTitle.toLowerCase().replace(/[/\\?%*:|"'<>\s]/g, '-');
  const a3 = document.createElement('a');
  a3.setAttribute('href', URL.createObjectURL(await zip.generateAsync({type: 'blob'}), { type: 'application/zip' }));
  a3.setAttribute('download', `${filename}.zip`);
  a3.innerText = `zip`;
  first.querySelector('.sheet-musicxml').appendChild(a3);
}

async function handleFileBuffer(buffer) {
  try {
    const ireal = new TextDecoder().decode(buffer);
    await populateSheets(ireal);
  }
  catch (error) {
    document.getElementById('error').textContent = 'This file is not recognized as an iReal Pro playlist.';
  }
}

async function handleFileUpload(e) {
  const reader = new FileReader();
  const file = e.target.files[0];
  reader.onloadend = async (upload) => {
    await handleFileBuffer(upload.target.result);
  };
  if (file.size < 1*1024*1024) {
    reader.readAsArrayBuffer(file);
  }
  else {
    document.getElementById('error').textContent = 'This file is too large.';
  }
}

async function handleIRealChange(e) {
  if (!e.target.value) return;
  try {
    await populateSheets(e.target.value);
  }
  catch {
    document.getElementById('error').textContent = 'This URI is not recognized as an iReal Pro playlist.';
    document.getElementById('ireal').value = '';
  }
}

async function handleSampleSelect(e) {
  if (!e.target.value) return;
  const sample = e.target.value;
  try {
    const ireal = await (await fetish(sample)).text();
    await populateSheets(ireal);
  }
  catch (error) {
    console.error(`Failed to load iReal Pro playlist ${sample}: ${error}`);
  }
}

function handleStopButton() {
  g_state.stop = true;
}

function handleEscKey(e) {
  if (e.keyCode === 27) {
    e.preventDefault();
    handleStopButton();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('upload').addEventListener('change', handleFileUpload);
  document.getElementById('samples').addEventListener('change', handleSampleSelect);
  document.getElementById('ireal').addEventListener('change', handleIRealChange);
  document.getElementById('stop').addEventListener('click', handleStopButton);
  window.addEventListener('keydown', handleEscKey);
  const mmaVersion = await (await fetish(window.location.href + 'mma/')).json();
  document.getElementById('version').textContent = JSON.stringify({
    'musicxml': `${iRealMusicXML.Version.name} v${iRealMusicXML.Version.version}`,
    'midi': `${mmaVersion.name} v${mmaVersion.version}`
  });
});

/**
 * Fetch wrapper to throw an error if the response is not ok.
 * Why indeed? https://github.com/whatwg/fetch/issues/18
 */
async function fetish(
  input,
  init,
) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(response.statusText);
  return response;
}

/**
 * Yield to browser.
 * https://stackoverflow.com/a/64814589/209184
 */
const yielder = () => new Promise((resolve) => setTimeout(() => resolve(), 0))
